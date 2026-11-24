// MisGastos — transcripción de voz (hold-to-talk) para el ingreso manual por voz.
// El botón 🎤 de la PWA graba el audio y lo manda aquí; esta función verifica al
// usuario (Firebase ID token) y transcribe con Groq (Whisper), devolviendo el
// texto. La PWA parsea ese texto (parseVoiceExpense) y abre el modal de confirmación.
//
// Variables de entorno (en Vercel):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (service account)
//   GROQ_API_KEY  (gratis en https://console.groq.com — para la transcripción)

import admin from 'firebase-admin';

function ensureAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }
}

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  try {
    ensureAdmin();
    const body = req.body || {};
    const idToken = String(body.idToken || '');
    const audioB64 = String(body.audio || '');
    const mime = String(body.mime || 'audio/mp4');

    // Auth: el token de Firebase del usuario logueado (evita abuso del endpoint).
    if (!idToken) return res.status(401).json({ ok: false, error: 'sin auth' });
    try { await admin.auth().verifyIdToken(idToken); }
    catch (e) { return res.status(401).json({ ok: false, error: 'auth inválida' }); }

    if (!audioB64) return res.status(400).json({ ok: false, error: 'sin audio' });
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: 'falta GROQ_API_KEY' });

    const buf = Buffer.from(audioB64.replace(/^data:[^,]*,/, ''), 'base64');
    // Extensión acorde al mime que mande el teléfono (iPhone: mp4; Android: webm).
    const ext = /webm/i.test(mime) ? 'webm' : /ogg/i.test(mime) ? 'ogg' : /wav/i.test(mime) ? 'wav' : /mpeg|mp3/i.test(mime) ? 'mp3' : 'm4a';

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), 'audio.' + ext);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    form.append('temperature', '0');

    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) return res.status(200).json({ ok: false, error: (j && j.error && j.error.message) || ('groq ' + r.status) });

    return res.status(200).json({ ok: true, text: String((j && j.text) || '').trim() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
