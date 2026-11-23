// MisGastos — función serverless de ingreso automático.
// El atajo de iOS (al recibir una notificación del banco) hace POST aquí con:
//   token  → identifica al usuario (mapeado en Firestore: ingest_tokens/{token})
//   texto  → el texto de la notificación del banco
// La función parsea monto + comercio y escribe el gasto directo en la cuenta del
// usuario (users/{uid}/transactions_credit), que la PWA muestra en tiempo real.
//
// Variables de entorno requeridas (configúralas en Vercel):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// (vienen del archivo de service account de Firebase; ver README).

import admin from 'firebase-admin';

// Inicializa Firebase Admin una sola vez (se reutiliza entre invocaciones).
function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // En Vercel la private key se guarda con los saltos de línea escapados.
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }
  return admin.firestore();
}

// Extrae monto, comercio y banco del texto de la notificación.
function parseNotif(texto) {
  texto = String(texto || '');
  const mm = texto.match(/\$\s?([\d][\d.]*)/);
  if (!mm) return { error: 'sin monto' };
  const amount = parseInt(mm[1].replace(/\./g, ''), 10) || 0;
  if (amount <= 0) return { error: 'monto 0' };

  let desc = '';
  // Detallada Santander: "...en COMERCIO, el DD-MM-AAAA..."
  const det = texto.match(/.*\ben\s+(.+?),?\s*el\s+\d/i);
  if (det && det[1]) {
    desc = det[1];
  } else {
    desc = texto
      .replace(/Banco Santander Chile/ig, ' ')
      .replace(/Santander/ig, ' ')
      .replace(/Notificaci[oó]n de/ig, ' ')
      .replace(/\$\s?[\d][\d.]*/g, ' ');
  }
  desc = String(desc)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^0-9A-Za-zÁÉÍÓÚÑáéíóúñ]+/, '')
    .replace(/[^0-9A-Za-zÁÉÍÓÚÑáéíóúñ)]+$/, '')
    .trim() || 'Gasto';

  // Banco detectado (para elegir la tarjeta del usuario).
  let banco = 'Santander';
  const mb = texto.match(/santander|bci|banco de chile|banco chile|scotia|falabella|ita[uú]|security|bice|estado|ripley|cencosud/i);
  if (mb) banco = mb[0];

  return { amount, desc, banco };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  try {
    const body = req.body || {};
    const token = String(body.token || '').trim();
    const texto = body.texto || body.text || '';
    if (!token) return res.status(400).json({ ok: false, error: 'sin token' });

    const db = getDb();

    // token → uid
    const tokSnap = await db.collection('ingest_tokens').doc(token).get();
    if (!tokSnap.exists) return res.status(401).json({ ok: false, error: 'token inválido' });
    const uid = tokSnap.data().uid;
    if (!uid) return res.status(401).json({ ok: false, error: 'token sin uid' });

    const parsed = parseNotif(texto);
    if (parsed.error) return res.status(200).json({ ok: false, error: parsed.error, texto });

    // Elegir la tarjeta de crédito del usuario que calce con el banco detectado.
    let cardId = 'santander';
    try {
      const st = await db.doc(`users/${uid}/settings/main`).get();
      const cards = (st.exists && Array.isArray(st.data().cards)) ? st.data().cards : [];
      const credito = cards.filter(c => (c.tipo || 'credito') === 'credito');
      const bl = parsed.banco.toLowerCase();
      const match = credito.find(c => (c.bank || '').toLowerCase().includes(bl) || bl.includes((c.bank || '').toLowerCase()));
      if (match) cardId = match.id;
      else if (credito[0]) cardId = credito[0].id;
    } catch (e) { /* usa 'santander' por defecto */ }

    // Anti-duplicado: misma tarjeta + mismo monto en los últimos 60 segundos
    // (Santander manda dos notificaciones por compra).
    const col = db.collection(`users/${uid}/transactions_credit`);
    const ahora = Date.now();
    const recent = await col.where('amount', '==', parsed.amount).limit(10).get();
    let dup = false;
    recent.forEach(d => {
      const t = d.data();
      if (t.cardId === cardId && t.date) {
        const dt = new Date(t.date).getTime();
        if (!isNaN(dt) && Math.abs(ahora - dt) < 60000) dup = true;
      }
    });
    if (dup) return res.status(200).json({ ok: true, dup: true, amount: parsed.amount });

    const id = 'push_' + ahora + '_' + Math.floor(Math.random() * 1000);
    await col.doc(id).set({
      id, cardId, amount: parsed.amount, desc: parsed.desc, cuotas: 1,
      currency: 'CLP', date: new Date().toISOString(), source: 'push', catId: '',
    });

    return res.status(200).json({ ok: true, amount: parsed.amount, desc: parsed.desc, cardId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
