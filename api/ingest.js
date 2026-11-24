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

// Extrae monto, comercio, banco (con alias) y tipo (crédito/débito) del texto de
// la notificación. Soporta varios bancos; cada uno nombra las cosas distinto:
//   Santander (detallada): "...en COMERCIO, el DD-MM-AAAA..."
//   Falabella: "Compraste $MONTO en COMERCIO Con tu CMR Mastercard ... en 3420"
//     (ojo: el texto NO dice "Falabella", se detecta por "CMR").
function parseNotif(texto) {
  texto = String(texto || '');
  const mm = texto.match(/\$\s?([\d][\d.]*)/);
  if (!mm) return { error: 'sin monto' };
  const amount = parseInt(mm[1].replace(/\./g, ''), 10) || 0;
  if (amount <= 0) return { error: 'monto 0' };

  // Banco + alias para calzar la tarjeta/cuenta del usuario.
  // "Compraste $X en ..." es el fraseo propio de Falabella (Santander usa "Compra
  // por", BCI "Realizaste una compra"), así que sirve de respaldo cuando el atajo
  // manda solo el título truncado, sin el "CMR" del cuerpo.
  const esFalabella = /\bcmr\b|falabella|\bcompraste\b/i.test(texto);
  let banco = 'Santander';
  let aliases = ['santander'];
  if (esFalabella) {
    banco = 'Falabella';
    aliases = ['falabella', 'cmr'];
  } else {
    const mb = texto.match(/santander|bci|banco de chile|banco chile|scotia|ita[uú]|security|bice|estado|ripley|cencosud/i);
    if (mb) { banco = mb[0]; aliases = [mb[0].toLowerCase()]; }
  }

  let desc = '';
  if (esFalabella) {
    // "Compraste $MONTO en COMERCIO Con tu CMR..." — el comercio va tras el 1er "en"
    // y termina en "Con tu" / "Si no" / punto / fin de línea.
    const f = texto.match(/\ben\s+(.+?)(?:\s+con\s+tu\b|\s+si\s+no\b|[.\n]|$)/i);
    if (f && f[1]) desc = f[1];
  }
  if (!desc) {
    // Santander detallada: "...en COMERCIO, el DD-MM-AAAA..."
    const det = texto.match(/.*\ben\s+(.+?),?\s*el\s+\d/i);
    if (det && det[1]) desc = det[1];
  }
  if (!desc) {
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

  // Tipo: CMR Mastercard = crédito; débito solo si el texto lo dice explícito.
  const tipo = /d[eé]bito|cuenta\s*corriente|cuentafalabella/i.test(texto) ? 'debito' : 'credito';

  return { amount, desc, banco, aliases, tipo };
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

    const esDebito = parsed.tipo === 'debito';
    const colName = esDebito ? 'transactions_debit' : 'transactions_credit';
    const idField = esDebito ? 'bank' : 'cardId'; // débito usa "bank", crédito "cardId"
    const aliases = (parsed.aliases && parsed.aliases.length) ? parsed.aliases : [parsed.banco.toLowerCase()];

    // Elegir la tarjeta/cuenta del usuario que calce con el banco detectado.
    let accountId = esDebito ? 'bci' : 'santander';
    try {
      const st = await db.doc(`users/${uid}/settings/main`).get();
      const data = st.exists ? st.data() : {};
      const list = esDebito
        ? (Array.isArray(data.debits) ? data.debits : [])
        : (Array.isArray(data.cards) ? data.cards.filter(c => (c.tipo || 'credito') === 'credito') : []);
      const match = list.find(c => {
        const b = (c.bank || '').toLowerCase();
        if (!b) return false;
        return aliases.some(a => b.includes(a) || a.includes(b));
      });
      if (match) accountId = match.id;
      else if (list[0]) accountId = list[0].id;
    } catch (e) { /* usa el fallback */ }

    // Anti-duplicado: misma tarjeta/cuenta + mismo monto en los últimos 60 segundos
    // (algunos bancos mandan dos notificaciones por compra).
    const col = db.collection(`users/${uid}/${colName}`);
    const ahora = Date.now();
    const recent = await col.where('amount', '==', parsed.amount).limit(10).get();
    let dup = false;
    recent.forEach(d => {
      const t = d.data();
      if (t[idField] === accountId && t.date) {
        const dt = new Date(t.date).getTime();
        if (!isNaN(dt) && Math.abs(ahora - dt) < 60000) dup = true;
      }
    });
    if (dup) return res.status(200).json({ ok: true, dup: true, amount: parsed.amount });

    const id = 'push_' + ahora + '_' + Math.floor(Math.random() * 1000);
    const doc = {
      id, amount: parsed.amount, desc: parsed.desc,
      currency: 'CLP', date: new Date().toISOString(), source: 'push', catId: '',
    };
    doc[idField] = accountId;
    if (!esDebito) doc.cuotas = 1; // crédito guarda cuotas (débito no)
    await col.doc(id).set(doc);

    return res.status(200).json({ ok: true, amount: parsed.amount, desc: parsed.desc, tipo: parsed.tipo, banco: parsed.banco, account: accountId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
