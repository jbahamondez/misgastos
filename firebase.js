import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, getDoc, setDoc, deleteDoc, writeBatch, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJRlWyrIBUM5f91JJ0OJKKKW54jQQ95Mw",
  authDomain: "mis-gastos-81f60.firebaseapp.com",
  projectId: "mis-gastos-81f60",
  storageBucket: "mis-gastos-81f60.firebasestorage.app",
  messagingSenderId: "323378339609",
  appId: "1:323378339609:web:69f6ceca48198bc9a32f88"
};

// Código que un usuario nuevo debe ingresar para crear cuenta. Cámbialo por el
// tuyo y entrégaselo solo a tus cercanos. Es una barrera "familiar" (vive en el
// cliente), suficiente para evitar registros casuales de desconocidos.
const INVITE_CODE = 'FAMILIA2026';

const fbApp = initializeApp(firebaseConfig);
const fbAuth = getAuth(fbApp);
const fbDb = initializeFirestore(fbApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

if(navigator.storage && navigator.storage.persist){ navigator.storage.persist().catch(()=>{}); }

window._fb = { app: fbApp, auth: fbAuth, db: fbDb, user: null };

// Escritura/borrado "fire and forget" hacia Firestore: si no hay sesión o falla
// (ej. offline), no interrumpe el flujo local — Firestore reintenta solo cuando
// vuelve la conexión gracias a la persistencia offline habilitada arriba.
window._fb.pendingOps = 0;
function trackPending(promise){
  window._fb.pendingOps++;
  window.updateSyncBadge&&window.updateSyncBadge();
  return promise.finally(()=>{
    window._fb.pendingOps--;
    window.updateSyncBadge&&window.updateSyncBadge();
  });
}

window._fb.cloudSet = async function(collName, id, data){
  const user = window._fb.user;
  if(!user) return;
  try{ await trackPending(setDoc(doc(fbDb,'users',user.uid,collName,String(id)), data, {merge:true})); }
  catch(err){ console.warn('cloudSet error',collName,id,err); }
};
window._fb.cloudDelete = async function(collName, id){
  const user = window._fb.user;
  if(!user) return;
  try{ await trackPending(deleteDoc(doc(fbDb,'users',user.uid,collName,String(id)))); }
  catch(err){ console.warn('cloudDelete error',collName,id,err); }
};

const SYNC_COLLECTIONS=['transactions_credit','transactions_debit','debts','people','categories','category_rules','household_services'];

// Activa el cache local (window._fb.cache) hidratado desde Firestore vía onSnapshot.
// Cada cambio en la nube se refleja en localStorage y refresca la pantalla activa
// (window.applyCloudCollection / window.applyCloudSettings, definidos en index.html).
function startCloudSync(uid){
  stopCloudSync();
  window._fb.cache={};
  // Contamos las colecciones pendientes de su PRIMER snapshot. Mientras haya
  // pendientes, los datos locales aún no reflejan la nube: los recordatorios
  // (ej. "sin clasificar") deben esperar para no dispararse con datos viejos.
  window._fb.firstSyncDone=false;
  window._fb.firstSyncPending=SYNC_COLLECTIONS.length;
  SYNC_COLLECTIONS.forEach(name=>{
    window._fb.cache[name]=new Map();
    let hydrated=false;
    const unsub=onSnapshot(collection(fbDb,'users',uid,name), snap=>{
      const map=new Map();
      snap.forEach(d=>map.set(d.id,d.data()));
      window._fb.cache[name]=map;
      if(!hydrated){
        hydrated=true;
        window.reconcileFirstSync&&window.reconcileFirstSync(name);
        window._fb.firstSyncPending--;
        if(window._fb.firstSyncPending<=0 && !window._fb.firstSyncDone){
          window._fb.firstSyncDone=true;
          window.onFirstSyncComplete&&window.onFirstSyncComplete();
        }
      }
      window.applyCloudCollection&&window.applyCloudCollection(name, Array.from(window._fb.cache[name].values()));
    });
    window._fb.unsubscribers.push(unsub);
  });
  const unsubSettings=onSnapshot(doc(fbDb,'users',uid,'settings','main'), snap=>{
    if(snap.exists()){
      window._fb.cache.settings=snap.data();
      window.applyCloudSettings&&window.applyCloudSettings(snap.data());
    }
  });
  window._fb.unsubscribers.push(unsubSettings);
  window._fb.syncEnabled=true;
  window.updateSyncBadge&&window.updateSyncBadge();
}

function stopCloudSync(){
  (window._fb.unsubscribers||[]).forEach(unsub=>unsub());
  window._fb.unsubscribers=[];
  window._fb.cache={};
  window._fb.syncEnabled=false;
  window._fb.firstSyncDone=false;
}

window._fb.unsubscribers=[];
window._fb.firstSyncDone=false;
window._fb.cache={};
window._fb.syncEnabled=false;

onAuthStateChanged(fbAuth, async function(user){
  window._fb.user = user;
  stopCloudSync();
  if(user){
    // Cambio de cuenta en este dispositivo: limpia los datos locales de la cuenta
    // anterior (token de ingreso incluido) para que no se mezclen. Si es el primer
    // login en el equipo (sin last_uid), NO se limpia: así el usuario original migra.
    try{
      const lastUid=localStorage.getItem('misgastos_last_uid')||'';
      if(lastUid && lastUid!==user.uid){ window.clearAccountLocalData&&window.clearAccountLocalData(); }
      localStorage.setItem('misgastos_last_uid', user.uid);
    }catch(e){}
    try{
      const migSnap=await getDoc(doc(fbDb,'users',user.uid,'settings','migration'));
      if(migSnap.exists() && migSnap.data().localStorageMigrated){
        startCloudSync(user.uid);
      }
    }catch(err){ console.warn('No se pudo verificar estado de migración para sync',err); }
  }
  window.updateSyncBadge&&window.updateSyncBadge();
  renderCloudStatus();
  renderAuthGate();
  if(user){ setTimeout(()=>window.maybeShowOnboarding&&window.maybeShowOnboarding(), 800); }
});

// ── Pantalla de acceso (login / registro con código) ───────────────────────
let _authMode='login';
window.setAuthMode=function(mode){
  _authMode=mode;
  const isSignup=mode==='signup';
  document.getElementById('auth-code').style.display=isSignup?'block':'none';
  document.getElementById('auth-submit').textContent=isSignup?'Crear cuenta':'Iniciar sesión';
  document.getElementById('auth-error').textContent='';
  const on='flex:1;padding:10px;border-radius:10px;border:none;background:var(--accent);color:var(--accent-ink);font-size:14px;font-weight:600;cursor:pointer';
  const off='flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:14px;font-weight:600;cursor:pointer';
  document.getElementById('auth-tab-login').style.cssText=isSignup?off:on;
  document.getElementById('auth-tab-signup').style.cssText=isSignup?on:off;
  document.getElementById('auth-forgot').style.display=isSignup?'none':'block';
  document.getElementById('auth-pass').setAttribute('autocomplete', isSignup?'new-password':'current-password');
};
window.renderAuthGate=function(){
  const gate=document.getElementById('auth-gate');
  if(!gate) return;
  if(window._fb.user){ gate.style.display='none'; }
  else {
    // Confirmado que NO hay sesión: recién ahí mostramos el formulario (antes se
    // ve solo el splash, para no "parpadear" el login a quien sí tiene sesión).
    gate.style.display='flex';
    const sp=document.getElementById('auth-splash'), fm=document.getElementById('auth-form');
    if(sp) sp.style.display='none';
    if(fm) fm.style.display='block';
    setAuthMode(_authMode);
  }
};
function _authErr(err){
  const msgs={
    'auth/invalid-email':'El email no es válido',
    'auth/invalid-credential':'Email o contraseña incorrectos',
    'auth/wrong-password':'Email o contraseña incorrectos',
    'auth/user-not-found':'Email o contraseña incorrectos',
    'auth/email-already-in-use':'Ya existe una cuenta con ese email',
    'auth/weak-password':'La contraseña debe tener al menos 6 caracteres',
    'auth/user-disabled':'Esta cuenta está deshabilitada',
    'auth/too-many-requests':'Demasiados intentos. Espera unos minutos',
    'auth/network-request-failed':'Sin conexión. Revisa tu internet'
  };
  return msgs[err&&err.code]||'No se pudo completar. Intenta de nuevo';
}
window.submitAuth=async function(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-pass').value;
  const errEl=document.getElementById('auth-error');
  errEl.textContent='';
  if(!email||!pass){ errEl.textContent='Ingresa email y contraseña'; return; }
  if(_authMode==='signup'){
    const code=document.getElementById('auth-code').value.trim();
    if(code!==INVITE_CODE){ errEl.textContent='Código de invitación inválido'; return; }
    // Seguridad: si este dispositivo ya tiene datos, confirmar (evita pisar los
    // datos de otra persona al crear una cuenta nueva en el mismo navegador).
    const hasLocal = (typeof getC==='function' && getC().length>0) || (typeof getD==='function' && getD().length>0);
    if(hasLocal && !confirm('Este dispositivo ya tiene datos. Si creas una cuenta NUEVA, esos datos se subirán a la cuenta nueva. ¿Continuar?')) return;
    try{
      const cred=await createUserWithEmailAndPassword(fbAuth,email,pass);
      if(hasLocal){ await _migrateLocalToCloud(cred.user.uid); }
      else { await setDoc(doc(fbDb,'users',cred.user.uid,'settings','migration'), {localStorageMigrated:true, migratedAt:Date.now(), cloudNative:true, version:1}); }
      startCloudSync(cred.user.uid);
      showToast('Cuenta creada ✓');
    }catch(err){ errEl.textContent=_authErr(err); }
  } else {
    try{ await signInWithEmailAndPassword(fbAuth,email,pass); }
    catch(err){ errEl.textContent=_authErr(err); }
  }
};
window.authForgot=async function(){
  const email=document.getElementById('auth-email').value.trim();
  if(!email){ document.getElementById('auth-error').textContent='Escribe tu email y vuelve a tocar'; return; }
  try{ await sendPasswordResetEmail(fbAuth,email); showToast('Te enviamos un correo para restablecer tu clave'); }
  catch(err){ document.getElementById('auth-error').textContent=_authErr(err); }
};
// Sube los datos locales de este dispositivo a la cuenta indicada (no borra nada
// local). Reutiliza el mismo mecanismo que la migración manual de Ajustes.
async function _migrateLocalToCloud(uid){
  const personas=getPersonas().map(name=>({id:slugify(name),name}));
  const reglas=getCatRules().map(r=>({...r,id:slugify(r.keyword)+'_'+slugify(r.catId)}));
  await migrateCollection(uid,'transactions_credit',getC());
  await migrateCollection(uid,'transactions_debit',getD());
  await migrateCollection(uid,'debts',getDeudas());
  await migrateCollection(uid,'people',personas);
  await migrateCollection(uid,'categories',getCategorias());
  await migrateCollection(uid,'category_rules',reglas);
  await migrateCollection(uid,'household_services',getServiciosHogar());
  const settings=await window.dataStore.getSettings();
  await setDoc(doc(fbDb,'users',uid,'settings','main'), settings, {merge:true});
  await setDoc(doc(fbDb,'users',uid,'settings','migration'), {localStorageMigrated:true, migratedAt:Date.now(), version:1});
}

// Registra (o re-registra) el token de ingreso automático: ingest_tokens/{token}
// → {uid}. El backend (Vercel) lo lee para saber a qué usuario pertenece un POST.
window.registerIngestToken = async function(token){
  const user=window._fb.user;
  if(!user || !token) return false;
  try{
    await setDoc(doc(fbDb,'ingest_tokens',token), {uid:user.uid, createdAt:Date.now()}, {merge:true});
    return true;
  }catch(err){ console.warn('registerIngestToken',err); return false; }
};

window.cloudLogin = async function(){
  const email = document.getElementById('cloud-email').value.trim();
  const pass = document.getElementById('cloud-pass').value;
  if(!email || !pass){ showToast('Ingresa email y contraseña','var(--red)'); return; }
  try{
    await signInWithEmailAndPassword(fbAuth, email, pass);
    showToast('Sesión iniciada ✓');
  }catch(err){
    const msgs={
      'auth/invalid-email':'El email no es válido',
      'auth/invalid-credential':'Email o contraseña incorrectos',
      'auth/wrong-password':'Email o contraseña incorrectos',
      'auth/user-not-found':'Email o contraseña incorrectos',
      'auth/user-disabled':'Esta cuenta está deshabilitada',
      'auth/too-many-requests':'Demasiados intentos. Espera unos minutos',
      'auth/network-request-failed':'Sin conexión. Revisa tu internet'
    };
    showToast(msgs[err.code]||'No se pudo iniciar sesión','var(--red)');
  }
};

window.cloudLogout = async function(){
  await signOut(fbAuth);
  showToast('Sesión cerrada');
};

// Convierte texto libre en un id de documento válido y estable (slug)
function slugify(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'') // quita tildes
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'') || 'item';
}

// Escribe un array de items en una colección, usando item.id (o un id derivado) como doc ID.
// setDoc = idempotente: re-ejecutar la migración sobrescribe, no duplica.
async function migrateCollection(uid, collName, items, idFn){
  if(!items || !items.length) return 0;
  const CHUNK=450;
  for(let i=0;i<items.length;i+=CHUNK){
    const batch=writeBatch(fbDb);
    items.slice(i,i+CHUNK).forEach(item=>{
      const id=String(idFn?idFn(item):item.id);
      batch.set(doc(fbDb,'users',uid,collName,id), item);
    });
    await batch.commit();
  }
  return items.length;
}

window.cloudMigrate = async function(){
  const user=window._fb.user;
  if(!user){ showToast('Inicia sesión primero','var(--red)'); return; }
  const uid=user.uid;
  const migRef=doc(fbDb,'users',uid,'settings','migration');
  try{
    const migSnap=await getDoc(migRef);
    if(migSnap.exists() && migSnap.data().localStorageMigrated){
      const fecha=new Date(migSnap.data().migratedAt).toLocaleString('es-CL');
      if(!confirm(`Ya migraste tus datos antes (${fecha}).\n\n¿Volver a migrar? Esto sobrescribirá en la nube los registros que coincidan por ID con tus datos locales actuales.`)) return;
    } else {
      if(!confirm('Esto copiará todos tus datos locales (transacciones, deudas, personas, categorías, reglas y configuración) a la nube.\n\nNo se borrará ni modificará nada en este dispositivo.\n\nSi quieres un respaldo descargable, expórtalo desde Ajustes antes de continuar.\n\n¿Continuar?')) return;
    }

    showToast('Migrando datos a la nube...');

    const personas=getPersonas().map(name=>({id:slugify(name),name}));
    const reglas=getCatRules().map(r=>({...r,id:slugify(r.keyword)+'_'+slugify(r.catId)}));

    const counts={};
    counts.credito=await migrateCollection(uid,'transactions_credit',getC());
    counts.debito=await migrateCollection(uid,'transactions_debit',getD());
    counts.deudas=await migrateCollection(uid,'debts',getDeudas());
    counts.personas=await migrateCollection(uid,'people',personas);
    counts.categorias=await migrateCollection(uid,'categories',getCategorias());
    counts.reglas=await migrateCollection(uid,'category_rules',reglas);
    counts.servicios=await migrateCollection(uid,'household_services',getServiciosHogar());

    const settings=await window.dataStore.getSettings();
    await setDoc(doc(fbDb,'users',uid,'settings','main'), settings, {merge:true});

    await setDoc(migRef, {localStorageMigrated:true, migratedAt:Date.now(), version:1});

    startCloudSync(uid);

    showToast('Migración completada ✓');
    console.log('Migración completada:', counts);
    renderCloudStatus();
  }catch(err){
    console.error('Error en migración:',err);
    showToast('Error en migración: '+err.message,'var(--red)');
  }
};

window.renderCloudStatus = async function(){
  const el = document.getElementById('cloud-sync-section');
  if(!el) return;
  const user = window._fb.user;
  if(user){
    let migInfo='Sin migrar aún';
    try{
      const migSnap=await getDoc(doc(fbDb,'users',user.uid,'settings','migration'));
      if(migSnap.exists() && migSnap.data().localStorageMigrated){
        migInfo='Última migración: '+new Date(migSnap.data().migratedAt).toLocaleString('es-CL');
      }
    }catch(err){ migInfo='No se pudo verificar estado de migración'; }
    el.innerHTML = `
      <div class="settings-row" style="align-items:center">
        <span class="row-label">☁️ Conectado como</span>
        <span class="row-val" style="font-size:12px">${user.email}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);padding:4px 0 8px">${migInfo}</div>
      <button onclick="cloudMigrate()" style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--accent);color:white;font-size:14px;font-weight:600;cursor:pointer">📤 Migrar datos a la nube</button>
      <button onclick="cloudLogout()" style="width:100%;margin-top:8px;padding:10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--red);font-size:14px;font-weight:600;cursor:pointer">Cerrar sesión</button>`;
  } else {
    el.innerHTML = `
      <input id="cloud-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;margin-bottom:8px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px;box-sizing:border-box">
      <input id="cloud-pass" type="password" placeholder="Contraseña" autocomplete="current-password" style="width:100%;margin-bottom:8px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px;box-sizing:border-box">
      <button onclick="cloudLogin()" style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--accent);color:white;font-size:14px;font-weight:600;cursor:pointer">Iniciar sesión</button>`;
  }
};
