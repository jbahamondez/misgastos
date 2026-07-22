'use strict';

const CARDS = {
  bci:    {id:'bci',    bank:'BCI',                num:'****6146',color:'#e63329',gradient:'card-bci',    limitCLP:9519000,limitUSD:470.74,emoji:'🔴'},
  bchile: {id:'bchile', bank:'Banco Chile',        num:'****8447',color:'#003087',gradient:'card-bchile', limitCLP:9519000,limitUSD:470.74,emoji:'🔵'},
  scotia: {id:'scotia', bank:'ScotiabankCencosud', num:'****',    color:'#fbbf24',gradient:'card-scotia', limitCLP:1470000,limitUSD:0,     emoji:'🟡'}
};

const ICONS = {
  TICKETMASTER:'🎟️',TRAVEL:'✈️',UBER:'🚗',RAPPI:'🛵',CABIFY:'🚗',
  SUPERMERCADO:'🛒',LIDER:'🛒',JUMBO:'🛒',UNIMARC:'🛒',
  FARMACIA:'💊',CRUZ:'💊',SALCOBRAND:'💊',
  RESTAURANT:'🍽️',DOMINO:'🍕',MCDONALD:'🍔',
  NETFLIX:'🎬',SPOTIFY:'🎵',AMAZON:'📦',APPLE:'🍎',
  STEAM:'🎮',COPEC:'⛽',SHELL:'⛽',ANULACIÓN:'↩️',DEFAULT:'💳'
};

const LS_C='gastos_credito_v2', LS_D='gastos_debito_v2', LS_S='sueldo_mensual', LS_DEUDAS='gastos_deudas_v1', LS_PERSONAS='deudas_personas_v1', LS_CATS='misgastos_categorias_v1', LS_CAT_RULES='misgastos_cat_rules_v1';

function getC(){try{return JSON.parse(localStorage.getItem(LS_C)||'[]')}catch{return[]}}
function getD(){try{return JSON.parse(localStorage.getItem(LS_D)||'[]')}catch{return[]}}
function saveC(a,opts){localStorage.setItem(LS_C,JSON.stringify(a));syncCollectionToCloud('transactions_credit',a,opts)}
function saveD(a,opts){localStorage.setItem(LS_D,JSON.stringify(a));syncCollectionToCloud('transactions_debit',a,opts)}
function getSueldo(){return parseFloat(localStorage.getItem(LS_S)||'0')}
function setSueldo(v){localStorage.setItem(LS_S,String(v));syncSettingsToCloud()}
// Valor de 1 USD en CLP, configurable en Ajustes. 0 = sin definir: los cobros en
// dolares NO se convierten ni suman a los totales en pesos (comportamiento previo).
function getValorDolar(){return parseFloat(localStorage.getItem('misgastos_valor_dolar')||'0')||0}
function setValorDolar(v){localStorage.setItem('misgastos_valor_dolar',String(v));syncSettingsToCloud()}
// Lleva un monto a CLP: si es USD lo multiplica por el valor del dolar (0 => 0,
// asi los USD no suman hasta que se define el valor). CLP queda igual.
function aCLP(amount,currency){ return currency==='USD' ? amount*getValorDolar() : amount; }
function getDeudas(){try{return JSON.parse(localStorage.getItem(LS_DEUDAS)||'[]')}catch{return[]}}
function saveDeudas(a,opts){localStorage.setItem(LS_DEUDAS,JSON.stringify(a));syncCollectionToCloud('debts',a,opts)}
function getPersonas(){try{return JSON.parse(localStorage.getItem(LS_PERSONAS)||'["🤍 Tamarindo"]')}catch{return['🤍 Tamarindo']}}
function savePersonas(a){localStorage.setItem(LS_PERSONAS,JSON.stringify(a));syncCollectionToCloud('people',a)}
const DEFAULT_CATS=[
  {id:'super',name:'Supermercado',emoji:'🛒',color:'#4CAF50'},
  {id:'comida',name:'Comida',emoji:'🍔',color:'#FF9800'},
  {id:'bencina',name:'Bencina',emoji:'⛽',color:'#F44336'},
  {id:'entrete',name:'Entretención',emoji:'🎬',color:'#9C27B0'},
  {id:'salud',name:'Salud',emoji:'💊',color:'#E91E63'},
  {id:'hogar',name:'Hogar',emoji:'🏠',color:'#795548'},
  {id:'ropa',name:'Ropa',emoji:'👕',color:'#00BCD4'},
  {id:'tech',name:'Tecnología',emoji:'📱',color:'#2196F3'},
  {id:'viajes',name:'Viajes',emoji:'✈️',color:'#FF5722'},
  {id:'otros',name:'Otros',emoji:'💰',color:'#607D8B'},
];
function getCategorias(){try{const s=localStorage.getItem(LS_CATS);return s?JSON.parse(s):DEFAULT_CATS.map(c=>({...c}))}catch{return DEFAULT_CATS.map(c=>({...c}))}}
function saveCategorias(a){localStorage.setItem(LS_CATS,JSON.stringify(a));syncCollectionToCloud('categories',a)}
function getCatById(id){return getCategorias().find(c=>c.id===id)||null}
function getCatRules(){try{return JSON.parse(localStorage.getItem(LS_CAT_RULES)||'[]')}catch{return[]}}
function saveCatRules(a){localStorage.setItem(LS_CAT_RULES,JSON.stringify(a));syncCollectionToCloud('category_rules',a)}

// ── Sync bidireccional con Firestore (cache local <-> nube) ────────────────
// Helpers de escritura/borrado: replican (best-effort, sin bloquear ni romper
// si falla/offline/no hay sesión) hacia Firestore.
function cloudSet(collName,id,data){ if(window._fb&&window._fb.cloudSet) window._fb.cloudSet(collName,id,data); }
function cloudDelete(collName,id){ if(window._fb&&window._fb.cloudDelete) window._fb.cloudDelete(collName,id); }

function slugifyLocal(s){
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'') || 'item';
}

// Mapeo entre el formato local (localStorage) y el formato de documentos en Firestore
// para cada colección, más la función que deriva el ID de documento estable.
const CLOUD_MAP = {
  transactions_credit:{ ls:LS_C, toCloud:a=>a, toLocal:a=>a, id:item=>item.id },
  transactions_debit:{ ls:LS_D, toCloud:a=>a, toLocal:a=>a, id:item=>item.id },
  debts:{ ls:LS_DEUDAS, toCloud:a=>a, toLocal:a=>a, id:item=>item.id },
  people:{ ls:LS_PERSONAS, toCloud:a=>a.map(name=>({id:slugifyLocal(name),name})), toLocal:a=>a.map(i=>i.name), id:item=>item.id },
  categories:{ ls:LS_CATS, toCloud:a=>a, toLocal:a=>a, id:item=>item.id },
  category_rules:{ ls:LS_CAT_RULES, toCloud:a=>a.map(r=>({...r,id:slugifyLocal(r.keyword)+'_'+slugifyLocal(r.catId)})), toLocal:a=>a.map(({id,...r})=>r), id:item=>item.id },
  household_services:{ ls:'misgastos_servicios_hogar_v1', toCloud:a=>a, toLocal:a=>a, id:item=>item.id }
};

// Sincroniza un array local completo hacia Firestore: crea/actualiza los items
// nuevos o cambiados y borra en la nube los que ya no estén en el array.
// No hace nada hasta que el cache de la colección esté hidratado (post-migración),
// para no borrar todo en la nube antes de migrar.
//
// opts.allowBulk=true: permite borrados masivos (usado por operaciones EXPLICITAS
// del usuario: "borrar todos los gastos" y "restaurar respaldo"). Sin ese flag,
// un sync que eliminaria casi toda una coleccion grande se ABORTA por completo:
// casi siempre es un localStorage corrupto (getX() devolvio [] por un parse fallido)
// que, de propagarse, borraria el historial en la nube. Mejor no tocar la nube.
function syncCollectionToCloud(collName,localArray,opts){
  if(!window._fb||!window._fb.syncEnabled) return;
  const cache=window._fb.cache[collName];
  if(!cache) return;
  const map=CLOUD_MAP[collName];
  const cloudArray=map.toCloud(localArray);
  const newIds=new Set(cloudArray.map(item=>String(map.id(item))));
  const toDelete=Array.from(cache.keys()).filter(id=>!newIds.has(id));
  // Guard anti-borrado masivo: solo protege el historial financiero irrecuperable
  // (gastos y deudas). Categorias/personas/reglas/servicios son pocas, se rehacen
  // facil y se borran en cascada legitimamente (ej. borrar una categoria elimina
  // sus reglas), asi que ahi no aplica el guard. Tampoco en operaciones allowBulk.
  const PROTEGIDAS=['transactions_credit','transactions_debit','debts'];
  if(!(opts&&opts.allowBulk) && PROTEGIDAS.includes(collName) && cache.size>=5 && toDelete.length>cache.size*0.5){
    console.error('[sync] Borrado masivo bloqueado en "'+collName+'": '+toDelete.length+' de '+cache.size+' documentos. Posible localStorage corrupto; no se modifica la nube.');
    if(window.showToast) showToast('⚠️ Sincronización pausada: datos locales inconsistentes','var(--red)');
    return; // no se toca la nube en absoluto (ni altas ni bajas)
  }
  cloudArray.forEach(item=>{
    const id=String(map.id(item));
    const prev=cache.get(id);
    if(!prev||JSON.stringify(prev)!==JSON.stringify(item)){
      cloudSet(collName,id,item);
      cache.set(id,item);
    }
  });
  toDelete.forEach(id=>{ cloudDelete(collName,id); cache.delete(id); });
}

function syncSettingsToCloud(){
  if(!window._fb||!window._fb.syncEnabled) return;
  cloudSet('settings','main',{sueldo:getSueldo(),valorDolar:getValorDolar(),billingDates:getBillingDates(),paymentDates:getPaymentDates(),paidFlags:getPaidFlags(),serviciosPaidFlags:getServiciosPaidFlags()});
}

const LOCAL_GETTERS = {
  transactions_credit:getC, transactions_debit:getD, debts:getDeudas,
  people:getPersonas, categories:getCategorias, category_rules:getCatRules,
  household_services:getServiciosHogar
};

// Llamado una sola vez por colección, en el primer snapshot tras activar el sync.
// Empuja a la nube cualquier ítem local que aún no esté en el cache (ej. un gasto
// agregado justo antes de que el listener se hidratara), sin borrar nada en la nube.
// Así se evita que applyCloudCollection sobrescriba localStorage perdiendo ese ítem.
window.reconcileFirstSync=function(collName){
  const map=CLOUD_MAP[collName];
  const cache=window._fb.cache[collName];
  if(!map||!cache) return;
  const cloudArray=map.toCloud(LOCAL_GETTERS[collName]());
  cloudArray.forEach(item=>{
    const id=String(map.id(item));
    if(!cache.has(id)){
      cloudSet(collName,id,item);
      cache.set(id,item);
    }
  });
};

// Llamado desde Firebase (onSnapshot) cuando cambia una colección en la nube:
// refleja el cambio en localStorage y refresca la pantalla activa.
window.applyCloudCollection=function(collName,cloudArray){
  const map=CLOUD_MAP[collName];
  if(!map) return;
  localStorage.setItem(map.ls,JSON.stringify(map.toLocal(cloudArray)));
  refreshCurrentPage();
};

// Llamado desde Firebase (onSnapshot) cuando cambia el doc settings/main.
window.applyCloudSettings=function(data){
  if(data.sueldo!==undefined) localStorage.setItem(LS_S,String(data.sueldo));
  if(data.valorDolar!==undefined) localStorage.setItem('misgastos_valor_dolar',String(data.valorDolar));
  if(data.billingDates) localStorage.setItem('misgastos_billing_dates',JSON.stringify(data.billingDates));
  if(data.paymentDates) localStorage.setItem('misgastos_payment_dates',JSON.stringify(data.paymentDates));
  if(data.paidFlags) localStorage.setItem('misgastos_paid_flags',JSON.stringify(data.paidFlags));
  if(data.serviciosPaidFlags) localStorage.setItem('misgastos_servicios_paid_flags',JSON.stringify(data.serviciosPaidFlags));
  refreshCurrentPage();
};

// Indicador visual (esquina inferior izquierda) del estado de sincronización con la nube.
window.updateSyncBadge=function(){
  const el=document.getElementById('sync-badge');
  if(!el||!window._fb) return;
  if(!window._fb.user){ el.className='sync-badge'; return; }
  if(!window._fb.syncEnabled){ el.className='sync-badge show off'; el.textContent='☁️'; el.title='Sin sincronizar'; return; }
  if(window._fb.pendingOps>0){ el.className='sync-badge show syncing'; el.textContent='🔄'; el.title='Sincronizando…'; return; }
  el.className='sync-badge show synced'; el.textContent='☁️'; el.title='Sincronizado';
};

// ── dataStore: capa intermedia de persistencia ─────────────────────────────
// Proxy 1:1 sobre localStorage (vía las funciones getX/saveX de arriba), las
// cuales ya replican hacia Firestore mediante syncCollectionToCloud/syncSettingsToCloud.
window.dataStore = {
  // Transacciones de crédito
  async getCreditTransactions(){ return getC(); },
  async saveCreditTransaction(tx){ const a=getC(); a.push(tx); saveC(a); return tx; },
  async updateCreditTransaction(id,patch){ const a=getC(); const i=a.findIndex(t=>t.id===id); if(i>=0){ a[i]=Object.assign({},a[i],patch); saveC(a); return a[i]; } return null; },
  async deleteCreditTransaction(id){ saveC(getC().filter(t=>t.id!==id)); },

  // Transacciones de débito
  async getDebitTransactions(){ return getD(); },
  async saveDebitTransaction(tx){ const a=getD(); a.push(tx); saveD(a); return tx; },
  async updateDebitTransaction(id,patch){ const a=getD(); const i=a.findIndex(t=>t.id===id); if(i>=0){ a[i]=Object.assign({},a[i],patch); saveD(a); return a[i]; } return null; },
  async deleteDebitTransaction(id){ saveD(getD().filter(t=>t.id!==id)); },

  // Deudas / splits
  async getDebts(){ return getDeudas(); },
  async saveDebt(debt){ const a=getDeudas(); a.push(debt); saveDeudas(a); return debt; },
  async updateDebt(id,patch){ const a=getDeudas(); const i=a.findIndex(d=>d.id===id); if(i>=0){ a[i]=Object.assign({},a[i],patch); saveDeudas(a); return a[i]; } return null; },
  async deleteDebt(id){ saveDeudas(getDeudas().filter(d=>d.id!==id)); },

  // Personas, categorías, reglas
  async getPeople(){ return getPersonas(); },
  async getCategories(){ return getCategorias(); },
  async getCategoryRules(){ return getCatRules(); },

  // Settings (sueldo, fechas de facturación/pago, flags de ciclos pagados)
  async getSettings(){
    return {
      sueldo: getSueldo(),
      billingDates: getBillingDates(),
      paymentDates: getPaymentDates(),
      paidFlags: getPaidFlags(),
      serviciosPaidFlags: getServiciosPaidFlags()
    };
  },
  async updateSettings(patch){
    if(patch.sueldo!==undefined) setSueldo(patch.sueldo);
    if(patch.billingDates) saveBillingDates(Object.assign({},getBillingDates(),patch.billingDates));
    if(patch.paymentDates) savePaymentDates(Object.assign({},getPaymentDates(),patch.paymentDates));
    if(patch.paidFlags) savePaidFlags(Object.assign({},getPaidFlags(),patch.paidFlags));
    if(patch.serviciosPaidFlags) saveServiciosPaidFlags(Object.assign({},getServiciosPaidFlags(),patch.serviciosPaidFlags));
  }
};

function autoCategorize(desc){
  if(!desc) return null;
  const rules=getCatRules();
  const lower=desc.toLowerCase();
  for(const r of rules){if(lower.includes(r.keyword.toLowerCase())) return r.catId;}
  return null;
}

function fmtCLP(n){const neg=n<0;return(neg?'-':'')+'$'+Math.round(Math.abs(n)).toLocaleString('es-CL')}
function fmtUSD(n){return 'USD '+parseFloat(n).toFixed(2)}
function fmtPct(n){return n.toFixed(1)+'%'}
function getIcon(d){const u=(d||'').toUpperCase();for(const[k,v]of Object.entries(ICONS))if(u.includes(k))return v;return ICONS.DEFAULT}

// Escapa texto de usuario antes de interpolarlo en innerHTML. Descripciones y
// nombres pueden venir de la URL (?desc=...), correos, cartolas o PDFs: nunca
// deben interpretarse como HTML (XSS almacenado). Los datos se guardan crudos;
// el escape es SIEMPRE al renderizar.
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Para argumentos string dentro de onclick="fn('X')": escapa JS (\ y ') y
// luego HTML — el navegador decodifica las entidades del atributo antes de
// parsear el JS, asi el valor llega intacto y no puede cerrar la comilla.
function escJsAttr(s){return esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));}

function getBillingDay(cardId){
  // Retorna el día de cierre de una tarjeta específica, o el global si no se especifica
  const dates=getBillingDates();
  if(cardId) return dates[cardId]||19;
  // Sin cardId: usar el día de BCI como referencia general del dashboard
  return dates['bci']||19;
}
function getCycle(cardId){
  const cutDay=getBillingDay(cardId);
  const now=new Date(),day=now.getDate();
  return day<=cutDay
    ?{start:new Date(now.getFullYear(),now.getMonth()-1,cutDay+1),end:new Date(now.getFullYear(),now.getMonth(),cutDay,23,59,59)}
    :{start:new Date(now.getFullYear(),now.getMonth(),cutDay+1),end:new Date(now.getFullYear(),now.getMonth()+1,cutDay,23,59,59)};
}
function getPrevCycle(cardId){
  const cutDay=getBillingDay(cardId);
  const cur=getCycle(cardId);
  // El ciclo anterior termina el día antes del inicio del ciclo actual
  const prevEnd=new Date(cur.start.getTime()-1);
  const prevStart=new Date(prevEnd.getFullYear(),prevEnd.getMonth()-1,cutDay+1);
  return{start:prevStart,end:prevEnd};
}
function getPrevCycleTxs(cardId){
  const{start,end}=getPrevCycle(cardId);
  return getC().filter(t=>t.cardId===cardId&&new Date(t.date)>=start&&new Date(t.date)<=end);
}
function getMonth(){
  const now=new Date();
  return{start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};
}
// Rango de fechas de los filtros de período que comparten Historial y Análisis.
// 'ciclo' usa el ciclo de facturación de referencia (BCI); 'todo' => null (sin filtro).
// Única fuente: si algún día cambia qué significa "mes anterior", cambia solo aquí.
function rangoPeriodo(id){
  const now=new Date();
  if(id==='ciclo'){const c=getCycle('bci');return{start:c.start,end:c.end};}
  if(id==='mes') return{start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};
  if(id==='mes-ant') return{start:new Date(now.getFullYear(),now.getMonth()-1,1),end:new Date(now.getFullYear(),now.getMonth(),0,23,59,59)};
  return null; // 'todo'
}
function getCycleTxs(cardId){
  const{start,end}=getCycle(cardId);
  return getC().filter(t=>t.cardId===cardId&&new Date(t.date)>=start&&new Date(t.date)<=end);
}
// Compra "prestada": pagada con mi tarjeta pero que no es mia (presté la tarjeta).
// No cuenta en NINGUN total mio; aparece marcada en las listas y como deuda por cobrar.
function esPrestada(t){ return t && t.lent===true; }
// Cupo comprometido: monto total (lo que bloquea el banco en tu cupo)
function spentCLP(id){return getCycleTxs(id).filter(t=>t.currency==='CLP'&&!esPrestada(t)).reduce((s,t)=>s+t.amount,0)}
function spentUSD(id){return getCycleTxs(id).filter(t=>t.currency==='USD'&&!esPrestada(t)).reduce((s,t)=>s+t.amount,0)}
// Cuotas que caen en un ciclo CON ARRASTRE: una compra en N cuotas aporta su
// cuota mensual a cada ciclo desde el de la compra hasta agotar las N cuotas.
// offset 0 = ciclo actual, -1 = ciclo anterior. Fuente unica usada por el
// dashboard, Tarjetas, recordatorio de pago, caja "ciclo anterior" y "¿Que debo?".
function cuotasActivasCiclo(cardId, offset){
  const cutDay=getBillingDay(cardId);
  const targetIdx=queDeboCycleIndex(new Date(), cutDay)+(offset||0);
  const out=[];
  getC().forEach(t=>{
    if(t.cardId!==cardId || esPrestada(t)) return; // las prestadas no son gasto mio
    const n=Math.max(1,t.cuotas||1);
    // cycleOffset: "aplazar" corre toda la serie de cuotas hacia adelante (banco aun no factura)
    const base=queDeboCycleIndex(t.date, cutDay)+(t.cycleOffset||0);
    const k=targetIdx - base; // cuota 0-indexada que cae en el ciclo
    if(k>=0 && k<n) out.push({tx:t, cuotaNum:k+1, cuotasTotal:n, cuotaAmt:t.amount/n});
  });
  return out;
}
function cuotaCicloCLP(id, offset){return cuotasActivasCiclo(id,offset).filter(x=>x.tx.currency==='CLP').reduce((s,x)=>s+x.cuotaAmt,0)}
function cuotaCicloUSD(id, offset){return cuotasActivasCiclo(id,offset).filter(x=>x.tx.currency==='USD').reduce((s,x)=>s+x.cuotaAmt,0)}
// Cargo del ciclo actual (cuota mensual con arrastre)
function cuotaCLP(id){return cuotaCicloCLP(id,0)}
function cuotaUSD(id){return cuotaCicloUSD(id,0)}
function daysToFact(cardId){
  const cutDay=getBillingDay(cardId);
  const now=new Date(),day=now.getDate();
  const t=day<=cutDay?new Date(now.getFullYear(),now.getMonth(),cutDay):new Date(now.getFullYear(),now.getMonth()+1,cutDay);
  return Math.max(0,Math.ceil((t-now)/86400000));
}
function debitoThisMonth(){
  const{start,end}=getMonth();
  return getD().filter(t=>{const d=new Date(t.date);return d>=start&&d<=end});
}

const PAGE_RENDERERS={dashboard:renderDashboard,tarjetas:renderTarjetas,debito:renderDebito,historial:renderHistorial,ajustes:renderAjustes,deudas:renderDeudas};

function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  PAGE_RENDERERS[name]?.();
}

// Re-renderiza la pantalla activa (usado cuando llegan cambios desde Firestore)
function refreshCurrentPage(){
  const active=document.querySelector('.page.active');
  if(!active) return;
  const name=active.id.replace('page-','');
  PAGE_RENDERERS[name]?.();
}

let _cicloAntOpen=false;
function toggleCicloAnt(){
  _cicloAntOpen=!_cicloAntOpen;
  document.getElementById('ciclo-ant-body').classList.toggle('open',_cicloAntOpen);
  document.getElementById('ciclo-ant-chevron').classList.toggle('open',_cicloAntOpen);
}
function renderCicloAnt(){
  const cards=Object.values(CARDS);
  let totalAnt=0;
  const rows=cards.map(c=>{
    const activas=cuotasActivasCiclo(c.id,-1).filter(x=>x.tx.currency==='CLP');
    const cuota=activas.reduce((s,x)=>s+x.cuotaAmt,0);
    const count=activas.length;
    totalAnt+=cuota;
    const{start,end}=getPrevCycle(c.id);
    const label=start.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})+' – '+end.toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
    return{c,cuota,count,label};
  });
  // Título con rango de fechas del ciclo anterior de BCI como referencia
  const{start,end}=getPrevCycle('bci');
  const rangeLabel=start.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})+' – '+end.toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
  document.getElementById('ciclo-ant-title').textContent='Ciclo anterior ('+rangeLabel+')';
  document.getElementById('ciclo-ant-total').innerHTML=fmtCLP(totalAnt)+'<span>total a pagar</span>';
  document.getElementById('ciclo-ant-list').innerHTML=rows.filter(r=>r.cuota>0).map(r=>`
    <div class="proy-card">
      <div class="proy-dot" style="background:${r.c.color}"></div>
      <span class="proy-name">${r.c.bank}</span>
      <div style="text-align:right">
        <div class="proy-amount" style="color:#fde68a">${fmtCLP(r.cuota)}</div>
        <div style="font-size:10px;color:var(--text2)">${r.count} cuota${r.count!==1?'s':''}</div>
      </div>
    </div>`).join('');
  // Ocultar si no hay cuotas que pagar en ninguna tarjeta
  const hayDatos=rows.some(r=>r.cuota>0);
  document.getElementById('ciclo-ant-box').style.display=hayDatos?'':'none';
}

function renderDashboard(){
  const now=new Date();
  document.getElementById('dash-fecha').textContent=now.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});

  // Totales
  let totCuota=0;
  // Suma la cuota CLP + la cuota USD convertida (aCLP; 0 si no hay valor definido)
  Object.values(CARDS).forEach(c=>{totCuota+=cuotaCLP(c.id)+aCLP(cuotaUSD(c.id),'USD');});
  const totDeb=debitoThisMonth().filter(t=>!esPrestada(t)).reduce((s,t)=>s+t.amount,0);
  const sueldo=getSueldo();
  // El widget "Total a pagar" es SOLO credito (deuda al banco). El debito ya esta
  // pagado: vive en su chip y en la Salud Financiera como consumo, no aqui.
  const pct=sueldo>0?Math.min(100,totCuota/sueldo*100):0;
  const barColor=pct>75?'var(--red)':pct>50?'var(--yellow)':'var(--green)';
  const days=daysToFact('bci');
  const billingDay=getBillingDay('bci');

  // Widget principal
  document.getElementById('dash-main-widget').innerHTML=`
    <div style="background:var(--bg2);border-radius:var(--radius);border:1px solid var(--border);padding:20px">
      <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Total a pagar este ciclo</div>
      <div style="font-size:38px;font-weight:700;margin-bottom:${sueldo?'14px':'6px'}">${fmtCLP(totCuota)}</div>
      ${sueldo?`
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px">
          <div style="width:${pct}%;background:${barColor};height:100%;border-radius:3px;transition:width .6s"></div>
        </div>
        <div style="font-size:12px;color:var(--text2)">Equivale al ${Math.round(pct)}% de tu sueldo</div>
      `:''}
      <div style="margin-top:10px;font-size:12px;color:var(--text2)">
        ${days===0?'⚡ Hoy es día de facturación':'📅 Faltan <strong style="color:var(--text)">'+days+' días</strong> para el cierre (día '+billingDay+')'}
      </div>
    </div>`;

  // 3 chips
  const totalDeudasAnt=deudaInstallments().filter(i=>i.section==='anterior'&&!i.paid).reduce((s,i)=>s+i.amt,0);
  document.getElementById('dash-chips').innerHTML=`
    <div style="flex:1;background:var(--bg2);border-radius:12px;border:1px solid var(--border);padding:12px;text-align:center">
      <div style="font-size:10px;color:var(--text2);margin-bottom:5px">💳 Crédito</div>
      <div style="font-size:16px;font-weight:700;color:var(--red)">${fmtCLP(totCuota)}</div>
    </div>
    <div style="flex:1;background:var(--bg2);border-radius:12px;border:1px solid var(--border);padding:12px;text-align:center">
      <div style="font-size:10px;color:var(--text2);margin-bottom:5px">🏦 Débito</div>
      <div style="font-size:16px;font-weight:700;color:var(--blue)">${fmtCLP(totDeb)}</div>
    </div>
    <div style="flex:1;background:${totalDeudasAnt>0?'rgba(139,92,246,.12)':'var(--bg2)'};border-radius:12px;border:1px solid ${totalDeudasAnt>0?'rgba(139,92,246,.4)':'var(--border)'};padding:12px;text-align:center">
      <div style="font-size:10px;color:var(--text2);margin-bottom:5px">🤝 Por cobrar</div>
      <div style="font-size:16px;font-weight:700;color:var(--accent2)">${totalDeudasAnt>0?fmtCLP(totalDeudasAnt):'—'}</div>
    </div>`;

  // Salud financiera
  renderSalud(totCuota);

  // Recientes
  const recent=[...getC(),...getD().map(t=>({...t,_isDebit:true}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  document.getElementById('recent-list').innerHTML=recent.length?recent.map(txHTML).join('')
    :'<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><h3>Sin gastos aún</h3><p>Toca + para agregar tu primer gasto</p><button onclick="openModal()" style="margin-top:14px;padding:10px 20px;border-radius:20px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px;font-weight:600;cursor:pointer">+ Agregar gasto</button></div>';
}

function renderSalud(totCred){
  const sueldo=getSueldo();
  const deb=debitoThisMonth().filter(t=>!esPrestada(t)).reduce((s,t)=>s+t.amount,0);
  const tot=totCred+deb;
  const ahorro=sueldo>0?Math.max(0,sueldo-tot):0;
  const pC=sueldo>0?Math.min(100,totCred/sueldo*100):0;
  const pD=sueldo>0?Math.min(100,deb/sueldo*100):0;
  const pT=sueldo>0?Math.min(100,tot/sueldo*100):0;
  const pA=sueldo>0?Math.max(0,100-pT):0;
  let badge,cls;
  if(!sueldo){badge='Sin sueldo ingresado';cls='badge-yellow';}
  else if(pT<50){badge='Salud Excelente';cls='badge-green';}
  else if(pT<75){badge='Salud Moderada';cls='badge-yellow';}
  else{badge='Alerta de gasto';cls='badge-red';}

  document.getElementById('salud-box').innerHTML=`
    <div class="salud-header"><h3>Salud Financiera</h3><span class="salud-badge ${cls}">${badge}</span></div>
    <div class="salud-sueldo-row">
      <span class="salud-sueldo-label">Ingreso mensual: <strong style="color:var(--text)" id="sueldo-display">${sueldo?(_sueldoOculto?'••••••':fmtCLP(sueldo)):'No ingresado'}</strong></span>
      ${sueldo?`<button class="sueldo-eye-btn" onclick="toggleSueldoVisibility()" title="${_sueldoOculto?'Mostrar ingreso':'Ocultar ingreso'}">${sueldoEyeIcon(_sueldoOculto)}</button>`:''}
      <button class="sueldo-edit-btn" onclick="toggleSueldoInput()">${sueldo?'Editar':'+ Ingresar'}</button>
    </div>
    <div class="sueldo-input-row" id="sueldo-input-row">
      <input type="number" id="sueldo-input" placeholder="Ej: 1500000" inputmode="numeric" value="${sueldo||''}" />
      <button onclick="guardarSueldo()">OK</button>
    </div>
    ${sueldo?`
    <div class="metrics-grid">
      <div class="metric-cell"><div class="metric-label">Total gastado</div>
        <div class="metric-val" style="color:${pT>75?'var(--red)':pT>50?'var(--yellow)':'var(--text)'}">${fmtCLP(tot)}</div>
        <div class="metric-sub">${fmtPct(pT)} del sueldo</div></div>
      <div class="metric-cell"><div class="metric-label">Ahorro potencial</div>
        <div class="metric-val" style="color:var(--green)">${fmtCLP(ahorro)}</div>
        <div class="metric-sub">${fmtPct(pA)} del sueldo</div></div>
      <div class="metric-cell"><div class="metric-label">Gasto credito</div>
        <div class="metric-val" style="color:var(--red)">${fmtCLP(totCred)}</div>
        <div class="metric-sub">${fmtPct(pC)} del sueldo</div></div>
      <div class="metric-cell"><div class="metric-label">Gasto debito</div>
        <div class="metric-val" style="color:var(--blue)">${fmtCLP(deb)}</div>
        <div class="metric-sub">${fmtPct(pD)} del sueldo</div></div>
    </div>
    <div style="margin-bottom:6px;font-size:11px;color:var(--text2)">Distribucion del sueldo</div>
    <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;display:flex">
      <div style="width:${pC}%;background:var(--red);transition:width .6s"></div>
      <div style="width:${pD}%;background:var(--blue);transition:width .6s"></div>
      <div style="width:${pA}%;background:var(--green);transition:width .6s"></div>
    </div>
    <div class="bar-sections">
      <div class="bar-section-item"><div class="bs-dot" style="background:var(--red)"></div>Credito ${fmtPct(pC)}</div>
      <div class="bar-section-item"><div class="bs-dot" style="background:var(--blue)"></div>Debito ${fmtPct(pD)}</div>
      <div class="bar-section-item"><div class="bs-dot" style="background:var(--green)"></div>Ahorro ${fmtPct(pA)}</div>
    </div>`:'<p style="font-size:13px;color:var(--text2);text-align:center;padding:10px 0">Ingresa tu sueldo para ver métricas</p>'}`;
}

let _sueldoOculto=true; // el ingreso arranca oculto por defecto
function sueldoEyeIcon(oculto){
  return oculto
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;display:block"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;display:block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function toggleSueldoVisibility(){
  _sueldoOculto=!_sueldoOculto;
  const sueldo=getSueldo();
  const display=document.getElementById('sueldo-display');
  const btn=document.querySelector('.salud-sueldo-row .sueldo-eye-btn');
  if(display) display.textContent=_sueldoOculto?'••••••':fmtCLP(sueldo);
  if(btn){ btn.innerHTML=sueldoEyeIcon(_sueldoOculto); btn.title=_sueldoOculto?'Mostrar ingreso':'Ocultar ingreso'; }
}
function toggleSueldoInput(){
  const r=document.getElementById('sueldo-input-row');
  r.classList.toggle('visible');
  if(r.classList.contains('visible'))document.getElementById('sueldo-input').focus();
}
function guardarSueldo(){
  const v=parseFloat(document.getElementById('sueldo-input').value);
  if(!v||v<=0){showToast('Ingresa un sueldo válido','var(--yellow)');return}
  setSueldo(v); renderDashboard(); showToast('Sueldo guardado');
}

function renderTarjetas(){
  const c2=document.getElementById('tarjetas-detail-list');
  c2.innerHTML='';
  Object.values(CARDS).forEach(c=>{
    const sCLP=spentCLP(c.id),sUSD=spentUSD(c.id),qCLP=cuotaCLP(c.id),qUSD=cuotaUSD(c.id);
    const disp=c.limitCLP-sCLP,pct=Math.min(100,sCLP/c.limitCLP*100);
    const bc=pct>85?'var(--red)':pct>60?'var(--yellow)':'var(--green)';
    const txs=getCycleTxs(c.id);
    const d=document.createElement('div');
    d.className='tarjeta-detail';
    d.innerHTML=`<div class="tarjeta-detail-header"><div class="bank-dot" style="background:${c.color}"></div>
      <div><h3>${c.bank}</h3><p>${c.num} - Factura el ${getBillingDay(c.id)}</p></div></div>
      <div class="tarjeta-stats">
        <div class="stat-cell"><div class="stat-label">Cupo comprometido</div>
          <div class="stat-val" style="color:${bc}">${fmtCLP(sCLP)}</div>
          <div class="stat-bar-wrap"><div class="stat-bar" style="width:${pct}%;background:${bc}"></div></div>
          <div style="font-size:10px;color:var(--text2);margin-top:3px">${Math.round(pct)}% del límite</div></div>
        <div class="stat-cell"><div class="stat-label">Cargo próximo al ${getBillingDay(c.id)}</div>
          <div class="stat-val" style="color:#fde68a">${fmtCLP(qCLP)}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:3px">cuotas a pagar (incl. arrastres)</div></div>
        <div class="stat-cell"><div class="stat-label">Disponible CLP</div>
          <div class="stat-val" style="color:var(--green)">${fmtCLP(disp)}</div></div>
        <div class="stat-cell"><div class="stat-label">Transacciones</div><div class="stat-val">${txs.length}</div></div>
        ${c.limitUSD>0?`
        <div class="stat-cell"><div class="stat-label">Gastado USD</div><div class="stat-val">${fmtUSD(sUSD)}</div></div>
        <div class="stat-cell"><div class="stat-label">Cargo USD al ${getBillingDay(c.id)}</div><div class="stat-val" style="color:#fde68a">${fmtUSD(qUSD)}</div></div>
        <div class="stat-cell"><div class="stat-label">Disponible USD</div><div class="stat-val" style="color:var(--green)">${fmtUSD(c.limitUSD-sUSD)}</div></div>`:''}
      </div>`;
    c2.appendChild(d);
    const rec=getCycleTxs(c.id).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
    if(rec.length){
      const w=document.createElement('div');
      w.style.cssText='padding:0 20px 14px;display:flex;flex-direction:column;gap:7px';
      w.innerHTML='<div style="font-size:11px;color:var(--text2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Ultimas transacciones</div>'+rec.map(txHTML).join('');
      c2.appendChild(w);
    }
  });
}

function renderDebito(){
  const txs=debitoThisMonth();
  const propios=txs.filter(t=>!esPrestada(t)); // los totales excluyen las prestadas
  const tot=propios.reduce((s,t)=>s+t.amount,0),n=propios.length;
  const avg=n?tot/n:0,mx=n?Math.max(...propios.map(t=>t.amount)):0;
  document.getElementById('debit-summary').innerHTML=`
    <div class="ds-label">Debito este mes</div><div class="ds-amount">${fmtCLP(tot)}</div>
    <div class="ds-sub">${n} transacciones</div>
    <div class="debit-stats">
      <div class="debit-stat"><div class="dl">Promedio por gasto</div><div class="dv">${fmtCLP(avg)}</div></div>
      <div class="debit-stat"><div class="dl">Mayor gasto</div><div class="dv">${fmtCLP(mx)}</div></div>
    </div>`;
  document.getElementById('debit-count').textContent=txs.length+' movimiento'+(txs.length!==1?'s':'');
  const list=document.getElementById('debit-list');
  const sorted=[...txs].sort((a,b)=>new Date(b.date)-new Date(a.date));
  list.innerHTML=sorted.length?sorted.map(t=>txHTML({...t,_isDebit:true})).join('')
    :'<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><h3>Sin gastos debito</h3><p>Importa una cartola o toca + para agregar</p></div>';
}

let importBank='bci', importType='debito', pendingRows=[];

// xlsx (SheetJS, ~880KB) cargado bajo demanda, solo al importar/conciliar una
// cartola Excel: sacarlo del arranque ahorra esa descarga en cada apertura.
// Mismo patron (y mismo hash SRI) que loadJsPDF/loadPdfJs.
let _xlsxPromise=null;
function loadXLSX(){
  if(window.XLSX) return Promise.resolve();
  if(!_xlsxPromise){
    _xlsxPromise=new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.integrity='sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==';
      s.crossOrigin='anonymous'; s.referrerPolicy='no-referrer';
      s.onload=res;
      s.onerror=()=>{ _xlsxPromise=null; rej(new Error('No se pudo cargar el lector de Excel (¿sin conexión?)')); };
      document.head.appendChild(s);
    });
  }
  return _xlsxPromise;
}

function selectImportType(type){
  importType=type;
  document.getElementById('chip-type-debito').classList.toggle('active', type==='debito');
  document.getElementById('chip-type-credito').classList.toggle('active', type==='credito');
  const hint=document.getElementById('import-hint');
  if(hint) hint.textContent = type==='credito'
    ? 'Cartola de tarjeta de crédito (.xls / .xlsx / .csv)'
    : 'Cartola de cuenta corriente (.xls / .xlsx / .csv)';
}

function selectImportBank(bank){
  importBank=bank;
  ['bci','bchile','scotia'].forEach(b=>{
    const el=document.getElementById('chip-'+b);
    if(el) el.classList.toggle('active', b===bank);
  });
}
function handleFileUpload(evt){
  const file=evt.target.files[0];
  if(!file)return;
  const isCSV=file.name.toLowerCase().endsWith('.csv');
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      let rows;
      if(isCSV){
        rows=parseCSV(e.target.result);
      }else{
        await loadXLSX();
        const wb=XLSX.read(e.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
      }
      pendingRows=parseCartola(rows,importBank);
      showPreview(pendingRows);
    }catch(err){
      console.error('Error cartola:',err);
      showToast('Error al leer el archivo: '+err.message,'var(--red)');
    }
  };
  if(isCSV)reader.readAsText(file,'UTF-8');else reader.readAsArrayBuffer(file);
  evt.target.value='';
}
function parseCSV(text){
  return text.split(/\r?\n/).filter(l=>l.trim()).map(l=>{
    const cols=[];let cur='',inQ=false;
    for(let i=0;i<l.length;i++){
      if(l[i]==='"'){inQ=!inQ;}
      else if((l[i]===','||l[i]===';')&&!inQ){cols.push(cur.trim());cur='';}
      else cur+=l[i];
    }
    cols.push(cur.trim());return cols;
  });
}
function parseMonto(raw){
  // Si ya es número (raw:true de SheetJS), devolver directo
  if(typeof raw==='number') return Math.abs(raw);
  // Si es string, limpiar formato chileno (puntos=miles, coma=decimal)
  const s=String(raw||'').trim().replace(/\$/g,'').replace(/\s/g,'');
  // Quitar puntos de miles y convertir coma decimal a punto
  const limpio=s.replace(/\./g,'').replace(',','.');
  return Math.abs(parseFloat(limpio.replace(/[^0-9.-]/g,''))||0);
}

function parseFecha(raw){
  // Número serial de Excel (raw:true) → convertir a fecha
  if(typeof raw==='number' && raw>10000){
    // Excel epoch: 1 enero 1900 = día 1 (con bug del año bisiesto 1900)
    const excelEpoch=new Date(1899,11,30,12,0,0);
    const fecha=new Date(excelEpoch.getTime()+raw*86400000);
    return isNaN(fecha.getTime())?null:fecha;
  }
  const s=String(raw||'').trim();
  // DD-MM-YYYY o DD/MM/YYYY o DD.MM.YYYY
  const dm=s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  // YYYY-MM-DD
  const ym=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  let y,m,d;
  if(dm){
    d=parseInt(dm[1]); m=parseInt(dm[2]);
    y=dm[3].length===2?2000+parseInt(dm[3]):parseInt(dm[3]);
  } else if(ym){
    y=parseInt(ym[1]); m=parseInt(ym[2]); d=parseInt(ym[3]);
  } else return null;
  // Crear fecha local (sin UTC offset)
  const fecha=new Date(y,m-1,d,12,0,0);
  return isNaN(fecha.getTime())?null:fecha;
}

function parseCartola(rows, bank){
  if(rows.length<2) return [];

  // Limpiar filas vacías al inicio
  while(rows.length>0 && rows[0].every(c=>!String(c||'').trim())) rows.shift();

  // Detectar fila de encabezado buscando columna FECHA
  let hr=-1, dc=-1, descC=-1, ac=-1, cargoC=-1, abonoC=-1, cuotasC=-1;
  for(let i=0;i<Math.min(25,rows.length);i++){
    const r=rows[i].map(c=>String(c||'').toUpperCase().trim());
    const di=r.findIndex(c=>c==='FECHA'||c==='DATE'||c==='F.TRANSACCION'||c==='FECHA TRANSACCIÓN'||c==='FECHA TRANSACCION');
    if(di<0) continue;
    hr=i; dc=di;

    // Buscar columna descripción por nombre
    descC = r.findIndex(c=>c.includes('DESCRI')||c.includes('DETALLE')||c.includes('GLOSA')||c.includes('CONCEPTO')||c.includes('COMERCIO'));

    // Buscar monto — incluir variantes con paréntesis y símbolos
    ac = r.findIndex(c=>c.replace(/[^A-Z]/g,'').includes('MONTO')||c.replace(/[^A-Z]/g,'').includes('IMPORTE')||c.replace(/[^A-Z]/g,'').includes('VALOR'));
    cargoC = r.findIndex(c=>c.includes('CARGO')||c==='DÉBITO'||c==='DEBITO');
    abonoC = r.findIndex(c=>c.includes('ABONO')||c==='CRÉDITO'||c==='CREDITO'||c==='HABER');
    cuotasC= r.findIndex(c=>c.includes('CUOTA'));
    break;
  }
  if(hr<0){ hr=0; dc=0; descC=1; ac=2; }

  // Si no encontramos descripción por nombre, inferir por posición
  // BCI crédito: Fecha(0)|Código(1)|Ciudad(2)|Descripción(3)|Tipo(4)|Monto(5)
  // En ese caso descC sería -1 → usar columna después del posible "código"
  if(descC<0){
    // Intentar detectar columna de descripción buscando la más larga en datos
    const sample=rows.slice(hr+1,hr+5);
    let bestCol=-1, bestLen=0;
    if(sample.length>0){
      for(let col=0;col<(sample[0]||[]).length;col++){
        if(col===dc||col===ac||col===cargoC||col===abonoC) continue;
        const avgLen=sample.reduce((s,r)=>s+String(r[col]||'').trim().length,0)/sample.length;
        if(avgLen>bestLen){bestLen=avgLen;bestCol=col;}
      }
    }
    descC=bestCol>=0?bestCol:dc+1;
  }

  const res=[];
  for(let i=hr+1;i<rows.length;i++){
    const r=rows[i];
    if(!r || r.every(c=>!String(c||'').trim())) continue;

    const rawDate = String(r[dc]||'').trim();
    const rawDesc = String(r[descC]||'').trim();

    // Skip si no hay fecha válida
    const fecha = parseFecha(rawDate);
    if(!fecha) continue;

    // Monto: prioridad monto > cargo > abono > última columna numérica
    let amount=0;
    if(ac>=0)       amount=parseMonto(r[ac]);
    if(!amount && cargoC>=0) amount=parseMonto(r[cargoC]);
    if(!amount && abonoC>=0) amount=parseMonto(r[abonoC]);
    if(!amount){
      // Buscar la ÚLTIMA columna con valor numérico > 100 (evitar códigos)
      for(let col=r.length-1;col>=0;col--){
        if(col===dc||col===descC) continue;
        const v=parseMonto(r[col]);
        if(v>=100){ amount=v; break; }
      }
    }
    if(!amount) continue;

    // Cuotas
    let cuotas=1;
    if(cuotasC>=0){
      const m=String(r[cuotasC]||'').match(/(\d+)/);
      if(m) cuotas=parseInt(m[1]);
    }

    // Limpiar descripción BCI: quitar "COMPRAS", "SAN CC 03-03", "CF 03-03", ciudad pegada
    const desc=(rawDesc||'Importado')
      .replace(/\bCOMPRAS\b/gi,'')
      .replace(/\bSAN\s+CC\s+\d+-\d+\b/gi,'')
      .replace(/\bCC\s+\d+-\d+\b/gi,'')
      .replace(/\bCF\s+\d+-\d+\b/gi,'')
      .replace(/\bDP\s+\*/gi,'')
      .replace(/\s{2,}/g,' ').trim()||'Importado';

    res.push({
      id:'imp_'+Date.now()+'_'+i,
      bank, rawDesc, desc, cuotas,
      date: fecha.toISOString(),
      amount
    });
  }
  return res;
}
function showPreview(rows){
  if(!rows.length){showToast('No se encontraron transacciones','var(--yellow)');return}
  document.getElementById('preview-count').textContent=rows.length+' movimientos';
  document.getElementById('preview-table').innerHTML='<thead><tr><th>Fecha</th><th>Descripcion</th><th>Monto</th></tr></thead><tbody>'
    +rows.slice(0,50).map(r=>'<tr><td>'+new Date(r.date).toLocaleDateString('es-CL')+'</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.rawDesc)+'</td><td style="font-weight:600">'+fmtCLP(r.amount)+'</td></tr>').join('')+'</tbody>';
  document.getElementById('preview-box').classList.add('visible');
}
function discardPreview(){pendingRows=[];document.getElementById('preview-box').classList.remove('visible');}
function confirmImport(){
  if(!pendingRows.length)return;
  const n=pendingRows.length;
  if(importType==='credito'){
    // Guardar todos primero
    const newTxs=pendingRows.map(r=>({
      id:r.id, cardId:importBank, amount:r.amount, desc:r.desc,
      cuotas:r.cuotas||1, currency:'CLP',
      date:r.date, source:'cartola',
      catId:autoCategorize(r.desc)||''
    }));
    saveC([...getC(),...newTxs]);
    // Preparar cola de splits con opción "Aplicar a todos / No aplicar a ninguno"
    const splitItems=pendingRows.map(r=>({
      txId:r.id, amount:r.amount, desc:r.desc,
      cuotas:r.cuotas||1, currency:'CLP', cardId:importBank, type:'credito'
    }));
    pendingRows=[];
    document.getElementById('preview-box').classList.remove('visible');
    renderDebito(); renderDashboard();
    showToast(n+' movimientos importados');
    // Abrir modal de split uno por uno con botones extra
    if(splitItems.length>0){
      _splitQueue=[...splitItems];
      _splitImportMode=true; // modo importación: mostrar botones "Todos/Ninguno"
      setTimeout(()=>processSplitQueue(),400);
    }
  } else {
    const newTxs=pendingRows.map(r=>({
      id:r.id, bank:importBank, amount:r.amount, desc:r.desc,
      currency:'CLP', date:r.date, source:'cartola',
      catId:autoCategorize(r.desc)||''
    }));
    saveD([...getD(),...newTxs]);
    pendingRows=[];
    document.getElementById('preview-box').classList.remove('visible');
    renderDebito(); renderDashboard();
    showToast(n+' movimientos importados como débito');
  }
}

let activeFilter='all', activeDateFilter='ciclo';

function renderHistorial(){
  // Date filter chips
  const dateFilters=[
    {id:'ciclo',label:'Este ciclo'},
    {id:'mes',label:'Este mes'},
    {id:'mes-ant',label:'Mes anterior'},
    {id:'todo',label:'Todo'},
  ];
  document.getElementById('hist-date-filters').innerHTML=dateFilters.map(f=>
    `<button class="hdf-chip ${activeDateFilter===f.id?'active':''}" onclick="setDateFilter('${f.id}')">${f.label}</button>`
  ).join('');

  // Type filter chips
  const filters=[{id:'all',label:'Todos'},{id:'credito',label:'Credito'},{id:'debito',label:'Debito'},{id:'bci',label:'BCI'},{id:'bchile',label:'Banco Chile'},{id:'scotia',label:'Scotia'}];
  document.getElementById('filter-row').innerHTML=filters.map(f=>`<button class="filter-chip ${activeFilter===f.id?'active':''}" onclick="setFilter('${f.id}')">${f.label}</button>`).join('');

  // Date range ('todo' => null, sin filtro)
  const rango=rangoPeriodo(activeDateFilter);
  const dateStart=rango?rango.start:null, dateEnd=rango?rango.end:null;

  // Search term
  const searchTerm=(document.getElementById('hist-search-input')?.value||'').trim().toLowerCase();

  let all=[];
  if(activeFilter==='all'||activeFilter==='credito'||CARDS[activeFilter])
    all=[...all,...getC().filter(t=>activeFilter==='all'||activeFilter==='credito'||t.cardId===activeFilter)];
  if(activeFilter==='all'||activeFilter==='debito'||CARDS[activeFilter])
    all=[...all,...getD().filter(t=>activeFilter==='all'||activeFilter==='debito'||t.bank===activeFilter).map(t=>({...t,_isDebit:true}))];

  // Apply date filter
  if(dateStart&&dateEnd){
    all=all.filter(t=>{const d=new Date(t.date);return d>=dateStart&&d<=dateEnd;});
  }

  // Apply search filter
  if(searchTerm){
    all=all.filter(t=>(t.desc||'').toLowerCase().includes(searchTerm));
  }

  all.sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('hist-subtitle').textContent=all.length+' movimiento'+(all.length!==1?'s':'');
  document.getElementById('hist-list').innerHTML=all.length?all.map(txHTML).join('')
    :'<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><h3>Sin resultados</h3><p>Prueba con otro filtro o búsqueda</p></div>';
}
function setFilter(id){activeFilter=id;renderHistorial();}
function setDateFilter(id){activeDateFilter=id;renderHistorial();}

let activeDeudasStatusFilter='pendiente';

function getDeudaType(d){
  if(d.type) return d.type;
  if(getD().find(t=>t.id===d.txId)) return 'debito';
  return 'credito';
}
// ── Deudas por cuota (arrastre estilo "¿Qué debo?") ────────────────────────
// Estado de pago por cuota. Compatibilidad con deudas viejas (solo tenian d.paid).
function cuotaPagada(d,k){ return Array.isArray(d.paidCuotas)?d.paidCuotas.includes(k):!!d.paid; }
function toggleCuotaPagada(debtId,k,val){
  const ds=getDeudas();
  const d=ds.find(x=>x.id===debtId);
  if(!d) return;
  const n=Math.max(1,d.cuotas||1);
  // inicializa paidCuotas desde el estado legacy (d.paid = todas / ninguna)
  let set=Array.isArray(d.paidCuotas)?d.paidCuotas.slice():(d.paid?Array.from({length:n},(_,i)=>i+1):[]);
  set=set.filter(x=>x!==k);
  if(val) set.push(k);
  set.sort((a,b)=>a-b);
  d.paidCuotas=set;
  d.paid=set.length>=n;                 // "pagada" = todas las cuotas cobradas
  d.paidDate=d.paid?new Date().toISOString():null;
  saveDeudas(ds);
}
// Expande cada deuda en sus cuotas VENCIDAS (hasta el ciclo actual), con nro de
// cuota y a que ciclo pertenece. Misma logica de ciclos que "¿Que debo?".
// El dia de corte es el de la TARJETA de la compra asociada (via txId), no el
// global: si algun dia las tarjetas cierran en dias distintos, cada deuda se
// asigna al ciclo correcto. Fallback al global para deudas de debito o cuya
// compra ya no existe (hoy es equivalente: todas cierran el mismo dia).
function deudaInstallments(){
  const cardDeTx={};
  getC().forEach(t=>{cardDeTx[t.id]=t.cardId;});
  const hoy=new Date();
  const out=[];
  getDeudas().forEach(d=>{
    const cutDay=getBillingDay(cardDeTx[d.txId]);
    const curIdx=queDeboCycleIndex(hoy, cutDay);
    const n=Math.max(1,d.cuotas||1);
    const base=queDeboCycleIndex(d.date, cutDay)+(d.cycleOffset||0); // "aplazar" corre la deuda de ciclo
    const per=(d.deudaPerCuota!=null?d.deudaPerCuota:(d.deudaTotal||0)/n);
    for(let k=1;k<=n;k++){
      const idx=base+(k-1);
      if(idx>curIdx) break;             // cuota futura, aun no vencida
      const section=idx===curIdx?'actual':(idx===curIdx-1?'anterior':'antiguas');
      out.push({d, k, n, amt:per, idx, section, paid:cuotaPagada(d,k)});
    }
  });
  return out;
}
function marcarCuotaCobrada(debtId,k){ toggleCuotaPagada(debtId,k,true); renderDeudas(); renderDashboard(); showToast('✅ Cuota cobrada'); }
function revertirCuotaCobrada(debtId,k){ toggleCuotaPagada(debtId,k,false); renderDeudas(); renderDashboard(); showToast('↩️ Cuota revertida','var(--yellow)'); }

// ── Aplazar compra a otro ciclo (el banco aun no la factura) ───────────────
// Corre la compra de credito Y sus deudas asociadas un ciclo hacia adelante
// (delta +1) o hacia atras (delta -1). Se pueden aplazar varias veces.
function cycleOffsetDeTx(txId){
  const t=getC().find(x=>x.id===txId);
  if(t) return t.cycleOffset||0;
  const d=getDeudas().find(x=>x.txId===txId);
  return d?(d.cycleOffset||0):0;
}
function aplazarCompra(txId, delta){
  let refreshed=false;
  const c=getC(); let cc=false;
  c.forEach(t=>{ if(t.id===txId){ t.cycleOffset=Math.max(0,(t.cycleOffset||0)+delta); cc=true; } });
  if(cc) saveC(c);
  const ds=getDeudas(); let dc=false;
  ds.forEach(d=>{ if(d.txId===txId){ d.cycleOffset=Math.max(0,(d.cycleOffset||0)+delta); dc=true; } });
  if(dc) saveDeudas(ds);
  if(!cc && !dc){ return; }
  renderDashboard(); renderDebito(); renderHistorial(); renderDeudas();
  const qd=document.getElementById('quedebo-overlay');
  if(qd && qd.classList.contains('open')) renderQueDebo();
  const off=cycleOffsetDeTx(txId);
  showToast(delta>0?('⏳ Aplazada '+(off>1?'('+off+' ciclos)':'al próximo ciclo')):(off>0?'↩️ Traída un ciclo atrás':'↩️ Reactivada en su ciclo'));
}
// Etiqueta "APLAZADA" para las listas
function aplazadaTag(off){ return off>0?` <span style="font-size:9px;font-weight:700;color:#eab308;background:rgba(251,191,36,.15);padding:1px 5px;border-radius:5px;vertical-align:middle">⏳ APLAZADA${off>1?' '+off+'x':''}</span>`:''; }
// Botones de aplazar/reactivar (para ¿Qué debo? y Deudas)
function aplazarControlHTML(txId, off){
  const b='font-size:10px;font-weight:600;padding:3px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer';
  const id=escJsAttr(txId); // el txId puede venir de fuentes externas (sync de correos)
  if(off>0) return `<button onclick="aplazarCompra('${id}',1)" style="${b}">⏳ Aplazar +1</button><button onclick="aplazarCompra('${id}',-1)" style="${b};color:var(--accent2);border-color:var(--accent2)">↩ Reactivar</button>`;
  return `<button onclick="aplazarCompra('${id}',1)" style="${b}">⏳ Aún no facturada · Aplazar</button>`;
}

function markAllCyclePaid(){
  const pend=deudaInstallments().filter(i=>i.section==='anterior'&&!i.paid);
  pend.forEach(i=>toggleCuotaPagada(i.d.id,i.k,true));
  renderDeudas();renderDashboard();
  if(pend.length) showToast(pend.length+' cuota'+(pend.length!==1?'s':'')+' cobrada'+(pend.length!==1?'s':'')+' ✓');
  else showToast('No hay cuotas pendientes en este ciclo','var(--yellow)');
}
function renderDeudas(){
  const todasDeudas=getDeudas();
  const allInst=deudaInstallments();
  const pendInst=allInst.filter(i=>!i.paid);
  const totalPend=pendInst.reduce((s,i)=>s+i.amt,0);

  document.getElementById('deudas-summary-box').innerHTML=`
    <div class="ds-label">Total por cobrar</div>
    <div class="ds-amount">${fmtCLP(totalPend)}</div>
    <div style="font-size:12px;color:var(--text2)">${pendInst.length} cuota${pendInst.length!==1?'s':''} por cobrar</div>`;

  document.getElementById('deudas-date-filters').innerHTML='';

  const statusFilters=[{id:'pendiente',label:'Pendientes'},{id:'pagado',label:'Pagadas'},{id:'all',label:'Todas'}];
  document.getElementById('deudas-filter-row').innerHTML=statusFilters.map(f=>
    `<button class="filter-chip ${activeDeudasStatusFilter===f.id?'active':''}" onclick="setDeudasStatusFilter('${f.id}')">${f.label}</button>`
  ).join('');

  const curCycle=getCycle();
  const prevCycle=getPrevCycle();
  const searchTerm=(document.getElementById('deudas-search-input')?.value||'').trim().toLowerCase();

  let inst=allInst;
  if(activeDeudasStatusFilter==='pendiente') inst=inst.filter(i=>!i.paid);
  else if(activeDeudasStatusFilter==='pagado') inst=inst.filter(i=>i.paid);
  if(searchTerm) inst=inst.filter(i=>(i.d.desc||'').toLowerCase().includes(searchTerm));

  document.getElementById('deudas-subtitle').textContent=inst.length+' cuota'+(inst.length!==1?'s':'');

  const content=document.getElementById('deudas-content');
  if(!todasDeudas.length){
    content.innerHTML='<div class="empty" style="margin-top:30px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><h3>Sin deudas</h3><p>Cuando dividas una compra aparecerá aquí</p></div>';
    return;
  }
  if(!inst.length){
    content.innerHTML='<div class="empty" style="margin-top:20px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><h3>Sin resultados</h3><p>Prueba con otro filtro o búsqueda</p></div>';
    return;
  }

  const fmtD=d=>d.toLocaleDateString('es-CL',{day:'numeric',month:'short'});

  function renderInstItem(it){
    const d=it.d;
    const tipo=getDeudaType(d);
    const tipoBadge=`<span class="deuda-type-badge ${tipo}">${tipo==='debito'?'Débito':'Crédito'}</span>`;
    const dateStr=new Date(d.date).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'});
    const cuotaStr=it.n>1?` · cuota ${it.k}/${it.n}`:'';
    const off=d.cycleOffset||0;
    // Aplazar solo aplica a credito (el debito ya esta pagado al instante)
    const aplazarLine=(tipo==='credito'&&!it.paid)?`<div style="flex-basis:100%;display:flex;gap:6px;margin-top:8px">${aplazarControlHTML(d.txId, off)}</div>`:'';
    return `<div class="deuda-item ${it.paid?'paid':''}" style="flex-wrap:wrap">
      <div class="deuda-item-info">
        <div class="deuda-item-title">${tipoBadge}<span class="deuda-item-desc">${esc(d.desc)}</span>${aplazadaTag(off)}</div>
        <div class="deuda-item-meta">${dateStr}${cuotaStr}${it.paid?' · ✅ Cobrada':''}</div>
      </div>
      <div class="deuda-item-amount">
        <div class="da ${it.paid?'paid':''}">${fmtCLP(it.amt)}</div>
        ${!it.paid?`<button class="btn-paid" onclick="marcarCuotaCobrada('${d.id}',${it.k})">✓ Cobrado</button>`
                 :`<button class="btn-paid done" onclick="revertirCuotaCobrada('${d.id}',${it.k})">↩ Revertir</button>`}
      </div>
      ${aplazarLine}
    </div>`;
  }

  function renderSection(icon,title,dateRange,items,section){
    if(!items.length) return '';
    const byPerson={};
    items.forEach(it=>{if(!byPerson[it.d.person])byPerson[it.d.person]=[];byPerson[it.d.person].push(it);});
    const totalSec=items.filter(it=>!it.paid).reduce((s,it)=>s+it.amt,0);
    const unpaidCount=items.filter(it=>!it.paid).length;
    const markAllBtn=section==='anterior'&&unpaidCount>0
      ?`<button class="btn-mark-all-cycle" onclick="markAllCyclePaid()">✓ Marcar todo cobrado (${unpaidCount})</button>`:'';
    const cardsHTML=Object.entries(byPerson).map(([person,pItems])=>{
      const pendTotal=pItems.filter(i=>!i.paid).reduce((s,i)=>s+i.amt,0);
      const shareBtn=pendTotal>0?`<button onclick="compartirDeuda('${escJsAttr(person)}','${section}')" title="Compartir deudas de ${esc(person)}" style="background:var(--accent2);border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:600;padding:5px 11px;cursor:pointer;flex-shrink:0">📤 Compartir</button>`:'';
      return `<div class="deuda-person-card">
        <div class="deuda-person-header"><h3>👤 ${esc(person)}</h3><div style="display:flex;align-items:center;gap:10px"><span class="deuda-total">${pendTotal>0?fmtCLP(pendTotal):'Al día ✅'}</span>${shareBtn}</div></div>
        ${pItems.sort((a,b)=>(new Date(b.d.date)-new Date(a.d.date))||a.k-b.k).map(renderInstItem).join('')}
      </div>`;
    }).join('');
    return `<div class="cycle-section">
      <div class="cycle-section-header">
        <div><span class="cycle-label">${icon} ${title}</span><span class="cycle-dates">${dateRange}</span></div>
        ${totalSec>0?`<span class="cycle-total-badge">${fmtCLP(totalSec)}</span>`:'<span class="cycle-total-badge paid">Al día ✅</span>'}
      </div>
      ${markAllBtn}${cardsHTML}
    </div>`;
  }

  const antiguas=inst.filter(i=>i.section==='antiguas');
  const anterior=inst.filter(i=>i.section==='anterior');
  const actual=inst.filter(i=>i.section==='actual');

  content.innerHTML=[
    renderSection('📦','Cuotas anteriores','antes del '+fmtD(prevCycle.start),antiguas,'antiguas'),
    renderSection('📅','Ciclo anterior',fmtD(prevCycle.start)+' – '+fmtD(prevCycle.end),anterior,'anterior'),
    renderSection('🔄','Ciclo actual',fmtD(curCycle.start)+' – '+fmtD(curCycle.end),actual,'actual'),
  ].join('');
}
function setDeudasStatusFilter(id){activeDeudasStatusFilter=id;renderDeudas();}
// ── Compartir como PDF (libreria cargada bajo demanda, no afecta el arranque) ──
let _jspdfPromise=null;
function loadJsPDF(){
  if(window.jspdf&&window.jspdf.jsPDF) return Promise.resolve();
  if(!_jspdfPromise){
    _jspdfPromise=new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.integrity='sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==';
      s.crossOrigin='anonymous'; s.referrerPolicy='no-referrer';
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  return _jspdfPromise;
}
// jsPDF (fuentes estandar) no dibuja emojis; deja acentos latinos y quita el resto.
function pdfSafe(s){ return String(s==null?'':s).replace(/[^\x20-\xFF]/g,'').replace(/\s+/g,' ').trim(); }
// '#4CAF50' -> [76,175,80] (para colorear bloques del PDF con el color de su categoria)
function hexToRgb(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex||''));
  if(!m) return null;
  const n=parseInt(m[1],16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function bloquesATexto(tituloDoc,bloques){
  const L=[pdfSafe(tituloDoc),''];
  bloques.forEach(b=>{
    L.push(pdfSafe(b.titulo)+(b.subtitulo?' — '+pdfSafe(b.subtitulo):''));
    L.push('─────────────────────');
    b.rows.forEach(r=>L.push('• '+pdfSafe(r.desc)+(r.sub?' ('+pdfSafe(r.sub)+')':'')+' — '+r.monto));
    L.push(pdfSafe(b.total.label)+': '+b.total.value);
    L.push('');
  });
  return L.join('\n').trim();
}
// Estilo "ejecutivo" (informe de gastos): tablas sobrias con columnas alineadas,
// sin puntos de color ni barras. Filas admiten col1 (columna fija de fecha) y
// pct (porcentaje secundario); el total admite color 'green'/'red' (ahorro/deficit).
function _pdfEjecutivo(doc,bloques,opts){
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=48;
  const INK=[24,28,38], GRY=[122,128,142], LN=[205,209,218], LNSOFT=[234,236,241], AC=[108,99,255], GREEN=[21,128,61], RED=[185,28,28];
  const setF=(st,sz,col)=>{ doc.setFont('helvetica',st); doc.setFontSize(sz); doc.setTextColor.apply(doc,col); };
  // Cabecera (solo primera pagina)
  setF('bold',10,AC); doc.text('MISGASTOS', M, 52, {charSpace:2});
  setF('normal',8.5,GRY); doc.text('Generado el '+new Date().toLocaleDateString('es-CL'), W-M, 52, {align:'right'});
  setF('bold',21,INK); doc.text(pdfSafe(opts.tituloPrincipal||'Informe'), M, 84);
  if(opts.subtitulo){ setF('normal',10,GRY); doc.text(pdfSafe(opts.subtitulo), M, 101); }
  doc.setDrawColor.apply(doc,INK); doc.setLineWidth(1.1); doc.line(M,114,W-M,114);
  let y=144;
  const nl=h=>{ if(y+h>H-58){ doc.addPage(); y=66; } };
  bloques.forEach(b=>{
    nl(72);
    // Titulo de seccion en mayusculas + regla fina
    setF('bold',9,GRY); doc.text(pdfSafe(b.titulo).toUpperCase(), M, y, {charSpace:1.1});
    if(b.subtitulo){ setF('normal',8.5,GRY); doc.text(pdfSafe(b.subtitulo), W-M, y, {align:'right'}); }
    y+=6; doc.setDrawColor.apply(doc,LN); doc.setLineWidth(0.8); doc.line(M,y,W-M,y);
    y+=17;
    b.rows.forEach((r,idx)=>{
      const rh=r.sub?27:19;
      nl(rh+6);
      const dx=r.col1?M+64:M;
      if(r.col1){ setF('normal',8.5,GRY); doc.text(pdfSafe(r.col1), M, y); }
      setF('normal',10,INK); doc.text(pdfSafe(r.desc), dx, y);
      if(r.pct){ setF('normal',8.5,GRY); doc.text(String(r.pct), W-M-80, y, {align:'right'}); }
      setF('bold',10,INK); doc.text(String(r.monto), W-M, y, {align:'right'});
      if(r.sub){ setF('normal',7.5,GRY); doc.text(pdfSafe(r.sub), dx, y+10); }
      if(idx<b.rows.length-1){
        const ly=y+(r.sub?16:7.5);
        doc.setDrawColor.apply(doc,LNSOFT); doc.setLineWidth(0.4); doc.line(M,ly,W-M,ly);
      }
      y+=rh;
    });
    // Total del bloque: regla firme + fila en negrita
    nl(34);
    doc.setDrawColor.apply(doc,INK); doc.setLineWidth(0.9); doc.line(M,y-10,W-M,y-10);
    setF('bold',10.5,INK); doc.text(pdfSafe(b.total.label), M, y+4);
    const tc=b.total.color==='green'?GREEN:(b.total.color==='red'?RED:INK);
    setF('bold',11,tc); doc.text(String(b.total.value), W-M, y+4, {align:'right'});
    y+=38;
  });
  // Pie de pagina + numeracion en todas las paginas
  const nP=doc.getNumberOfPages();
  for(let p=1;p<=nP;p++){
    doc.setPage(p);
    doc.setDrawColor.apply(doc,LNSOFT); doc.setLineWidth(0.5); doc.line(M,H-40,W-M,H-40);
    setF('normal',7.5,GRY);
    doc.text('Generado con MisGastos · '+new Date().toLocaleDateString('es-CL'), M, H-27);
    doc.text('Página '+p+' de '+nP, W-M, H-27, {align:'right'});
  }
}
async function compartirPDF(filename,tituloDoc,bloques,opts){
  let ready=false;
  try{ await loadJsPDF(); ready=!!(window.jspdf&&window.jspdf.jsPDF); }catch(e){ ready=false; }
  if(!ready){ // sin libreria (offline): vuelve a texto como antes
    const text=bloquesATexto(tituloDoc,bloques);
    if(navigator.share) navigator.share({text}).catch(()=>{});
    else navigator.clipboard.writeText(text).then(()=>showToast('✅ Copiado al portapapeles')).catch(()=>showToast('No se pudo copiar','var(--yellow)'));
    return;
  }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({unit:'pt',format:'a4'});
  if(opts&&opts.estilo==='ejecutivo'){
    _pdfEjecutivo(doc,bloques,opts);
    return _compartirDocPDF(doc,filename,tituloDoc);
  }
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=40;
  const AC=[108,99,255], AC2=[167,139,250], INK=[33,37,48], GRY=[130,135,148], ZEB=[244,244,250], TOTBG=[238,235,255], BARBG=[229,229,236];
  const footer=()=>{ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor.apply(doc,GRY); doc.text('Generado con MisGastos · '+new Date().toLocaleDateString('es-CL'), M, H-24); };
  // Cabecera con color de marca
  doc.setFillColor.apply(doc,AC); doc.rect(0,0,W,92,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.text('MisGastos', M, 46);
  doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.text(pdfSafe(tituloDoc), M, 70);
  let y=124;
  const nl=h=>{ if(y+h>H-40){ footer(); doc.addPage(); y=56; } };
  bloques.forEach(b=>{
    const bc=b.color||AC2; // color del bloque (ej. color de la categoria); acento por defecto
    nl(96);
    // Encabezado del bloque: punto de color + titulo + subtitulo a la derecha
    doc.setFillColor.apply(doc,bc); doc.circle(M+4, y-4, 4, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor.apply(doc,INK);
    doc.text(pdfSafe(b.titulo), M+14, y);
    if(b.subtitulo){ doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor.apply(doc,GRY); doc.text(pdfSafe(b.subtitulo), W-M, y, {align:'right'}); }
    y+=8; doc.setDrawColor.apply(doc,bc); doc.setLineWidth(1.5); doc.line(M,y,W-M,y); doc.setLineWidth(0.5); y+=6;
    // Barra de porcentaje (opcional): refleja la barra por categoria de la app
    if(typeof b.barPct==='number'){
      doc.setFillColor.apply(doc,BARBG); doc.roundedRect(M, y, W-2*M, 4, 2, 2, 'F');
      const bw=Math.max(4,(W-2*M)*Math.min(100,b.barPct)/100);
      doc.setFillColor.apply(doc,bc); doc.roundedRect(M, y, bw, 4, 2, 2, 'F');
      y+=12;
    }
    y+=8;
    // Filas con zebra; cada fila puede tener una sublinea gris (fecha, tarjeta...)
    b.rows.forEach((r,idx)=>{
      const hasBar=typeof r.barPct==='number';
      const rh=(r.sub?32:22)+(hasBar?9:0);
      nl(rh+2);
      if(idx%2===0){ doc.setFillColor.apply(doc,ZEB); doc.rect(M-6, y-13, W-2*M+12, rh, 'F'); }
      doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor.apply(doc,INK); doc.text(pdfSafe(r.desc), M, y);
      doc.setFont('helvetica','bold'); doc.text(String(r.monto), W-M, y, {align:'right'});
      if(r.sub){ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor.apply(doc,GRY); doc.text(pdfSafe(r.sub), M, y+11); }
      if(hasBar){
        const by=y+(r.sub?15:6);
        doc.setFillColor.apply(doc,BARBG); doc.roundedRect(M, by, W-2*M-70, 3.5, 1.75, 1.75, 'F');
        const bw2=Math.max(3.5,(W-2*M-70)*Math.min(100,r.barPct)/100);
        doc.setFillColor.apply(doc,bc); doc.roundedRect(M, by, bw2, 3.5, 1.75, 1.75, 'F');
      }
      y+=rh;
    });
    // Total resaltado
    y+=8; nl(30);
    doc.setFillColor.apply(doc,TOTBG); doc.roundedRect(M-6, y-15, W-2*M+12, 26, 5, 5, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor.apply(doc,INK); doc.text(pdfSafe(b.total.label), M, y+2);
    doc.setTextColor.apply(doc,AC); doc.text(String(b.total.value), W-M, y+2, {align:'right'});
    y+=44;
  });
  footer();
  // Numeros de pagina en todas las paginas
  const nPages=doc.getNumberOfPages();
  for(let p=1;p<=nPages;p++){
    doc.setPage(p);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor.apply(doc,GRY);
    doc.text('Página '+p+' de '+nPages, W-M, H-24, {align:'right'});
  }
  return _compartirDocPDF(doc,filename,tituloDoc);
}
// Comparte (o descarga) un documento jsPDF ya dibujado
async function _compartirDocPDF(doc,filename,tituloDoc){
  const blob=doc.output('blob');
  const file=new File([blob],filename,{type:'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:pdfSafe(tituloDoc)}); }
    catch(e){ if(!e||e.name!=='AbortError') showToast('No se pudo compartir el PDF','var(--yellow)'); }
    return;
  }
  // Sin soporte para compartir archivos (ej. escritorio): descargar
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  showToast('PDF generado ✓');
}
function _rowsDeInstallments(items){
  return items.sort((a,b)=>(new Date(b.d.date)-new Date(a.d.date))||a.k-b.k).map(i=>({
    desc:i.d.desc,
    sub:new Date(i.d.date).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'})+(i.n>1?' · cuota '+i.k+'/'+i.n:''),
    monto:fmtCLP(i.amt)
  }));
}
function _slugPersona(p){ return p.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase()||'persona'; }

function compartirResumenDeudas(){
  const pend=deudaInstallments().filter(i=>!i.paid);
  if(!pend.length){showToast('No hay cuotas por cobrar','var(--yellow)');return;}
  const byPerson={};
  pend.forEach(i=>{if(!byPerson[i.d.person])byPerson[i.d.person]=[];byPerson[i.d.person].push(i);});
  const mes=new Date().toLocaleDateString('es-CL',{month:'long',year:'numeric'});
  const bloques=Object.entries(byPerson).map(([person,items])=>({
    titulo:person,
    rows:_rowsDeInstallments(items),
    total:{label:'Total que me debes',value:fmtCLP(items.reduce((s,i)=>s+i.amt,0))}
  }));
  compartirPDF('deudas_resumen.pdf','Resumen de deudas — '+(mes.charAt(0).toUpperCase()+mes.slice(1)),bloques);
}

// Comparte (PDF) las cuotas PENDIENTES de UNA persona en UN ciclo (section: antiguas|anterior|actual)
function compartirDeuda(person, section){
  const items=deudaInstallments().filter(i=>i.section===section&&!i.paid&&i.d.person===person);
  if(!items.length){showToast('Sin cuotas por cobrar','var(--yellow)');return;}
  const secLabel=section==='anterior'?'Ciclo anterior':section==='actual'?'Ciclo actual':'Cuotas anteriores';
  const bloque={
    titulo:person,
    subtitulo:secLabel+' · '+new Date().toLocaleDateString('es-CL'),
    rows:_rowsDeInstallments(items),
    total:{label:'Total que me debes',value:fmtCLP(items.reduce((s,i)=>s+i.amt,0))}
  };
  compartirPDF('deuda_'+_slugPersona(person)+'_'+section+'.pdf','Resumen de deuda',[bloque]);
}

function markDebtPaid(id){
  const ds=getDeudas();
  const idx=ds.findIndex(d=>d.id===id);
  if(idx<0)return;
  ds[idx].paid=true; ds[idx].paidDate=new Date().toISOString();
  saveDeudas(ds);
  renderDeudas();
  showToast('✅ Deuda marcada como pagada');
}
function unmarkDebtPaid(id){
  const ds=getDeudas();
  const idx=ds.findIndex(d=>d.id===id);
  if(idx<0)return;
  ds[idx].paid=false; ds[idx].paidDate=null;
  saveDeudas(ds);
  renderDeudas();
  showToast('↩️ Deuda revertida a pendiente','var(--yellow)');
}

function getBillingDates(){try{return JSON.parse(localStorage.getItem('misgastos_billing_dates')||'{}')}catch{return{}}}
function saveBillingDates(d){localStorage.setItem('misgastos_billing_dates',JSON.stringify(d));syncSettingsToCloud()}

function renderAjustes(){
  document.getElementById('settings-cards-list').innerHTML=Object.values(CARDS).map(c=>`<div class="settings-row"><span class="row-label">${c.emoji} ${c.bank} ${c.num}</span><span class="row-val">${fmtCLP(c.limitCLP)}</span></div>`).join('');
  renderPersonasAjustes();
  renderCategoriasAjustes();
  renderServiciosAjustes();
  // Fechas de facturación
  const billing=getBillingDates();
  const tarjetas=[
    {id:'bci',label:'💳 BCI'},
    {id:'bchile',label:'💳 Banco Chile'},
    {id:'scotia',label:'💳 Scotiabank'},
  ];
  document.getElementById('billing-dates-list').innerHTML=tarjetas.map(t=>`
    <div class="settings-row" style="align-items:center;gap:10px">
      <span class="row-label" style="flex:1">${t.label}</span>
      <span style="font-size:12px;color:var(--text2)">Día de cierre:</span>
      <input type="number" min="1" max="31" inputmode="numeric" pattern="[0-9]*" value="${billing[t.id]||19}"
        style="width:52px;text-align:center;padding:6px 4px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px"
        onblur="updateBillingDate('${t.id}',this.value||'19');this.value=getBillingDates()['${t.id}']||19"
        onkeydown="if(event.key==='Enter'){this.blur()}"
      />
    </div>`).join('');
  // Días de vencimiento de pago
  const payment=getPaymentDates();
  document.getElementById('payment-dates-list').innerHTML=tarjetas.map(t=>`
    <div class="settings-row" style="align-items:center;gap:10px">
      <span class="row-label" style="flex:1">${t.label}</span>
      <span style="font-size:12px;color:var(--text2)">Día de pago:</span>
      <input type="number" min="1" max="31" inputmode="numeric" pattern="[0-9]*" value="${payment[t.id]||5}"
        style="width:52px;text-align:center;padding:6px 4px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px"
        onblur="updatePaymentDate('${t.id}',this.value||'5');this.value=getPaymentDates()['${t.id}']||5"
        onkeydown="if(event.key==='Enter'){this.blur()}"
      />
    </div>`).join('');
  // Valor del dólar: convierte los cobros en USD a pesos en todos los totales
  const vdRow=document.getElementById('valor-dolar-row');
  if(vdRow){
    const vd=getValorDolar();
    vdRow.innerHTML=`
      <div class="settings-row" style="align-items:center;gap:10px">
        <span class="row-label" style="flex:1">Valor de 1 USD en pesos</span>
        <input type="number" min="0" inputmode="numeric" value="${vd||''}" placeholder="Ej: 950"
          style="width:90px;text-align:right;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px"
          onblur="updateValorDolar(this.value)" onkeydown="if(event.key==='Enter'){this.blur()}" />
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.5">Los cobros en dólares (ej. suscripciones internacionales) se convierten a pesos con este valor y se suman a tus totales. Déjalo en blanco para no convertir. Es una <strong style="color:var(--text)">estimación</strong>: el banco factura con su propia tasa.</div>`;
  }
}
function updateValorDolar(v){
  const n=Math.max(0,parseFloat(v)||0);
  setValorDolar(n);
  renderDashboard();
  showToast(n>0?('Valor del dólar: '+fmtCLP(n)):'Valor del dólar sin definir');
}

// ── Categorías ────────────────────────────────────────────────────────────
const CAT_COLORS=['#4CAF50','#FF9800','#F44336','#9C27B0','#E91E63','#795548','#00BCD4','#2196F3','#FF5722','#607D8B','#FFC107','#009688','#673AB7','#3F51B5','#CDDC39'];
let _editCatId=null;

function renderPersonasAjustes(){
  const personas=getPersonas();
  const el=document.getElementById('personas-list');
  if(!el) return;
  el.innerHTML=personas.map((p,i)=>`
    <div class="settings-row" style="gap:10px">
      <span class="row-label" style="flex:1">👤 ${esc(p)}</span>
      <button onclick="deletePersona(${i})" style="padding:5px 12px;border-radius:8px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:12px;font-weight:600;cursor:pointer">Eliminar</button>
    </div>`).join('');
}
function deletePersona(idx){
  const ps=getPersonas();
  if(ps.length<=1){showToast('Debe quedar al menos una persona','var(--yellow)');return;}
  ps.splice(idx,1);
  savePersonas(ps);
  renderPersonasAjustes();
  showToast('Persona eliminada');
}

// ── Servicios del hogar ──────────────────────────────────────────────────
let _editServicioId=null;
function renderServiciosAjustes(){
  const el=document.getElementById('servicios-list');
  if(!el) return;
  const servicios=getServiciosHogar();
  el.innerHTML=servicios.map(s=>`
    <div class="settings-row" style="gap:10px">
      <span style="font-size:18px">${esc(s.emoji)}</span>
      <span class="row-label" style="flex:1">${esc(s.name)}</span>
      <span style="font-size:12px;color:var(--text2)">día ${s.day}</span>
      <button onclick="openEditServicioModal('${escJsAttr(s.id)}')" style="background:none;border:none;color:var(--text2);font-size:13px;cursor:pointer;padding:4px 6px">✏️</button>
      <button onclick="deleteServicio('${escJsAttr(s.id)}')" style="background:none;border:none;color:var(--red);font-size:13px;cursor:pointer;padding:4px 6px">🗑️</button>
    </div>`).join('');
}
function openAddServicioModal(){
  _editServicioId=null;
  document.getElementById('add-servicio-title').textContent='Nuevo servicio';
  document.getElementById('servicio-emoji-input').value='';
  document.getElementById('servicio-name-input').value='';
  document.getElementById('servicio-day-input').value='';
  document.getElementById('add-servicio-overlay').classList.add('open');
}
function openEditServicioModal(id){
  const s=getServiciosHogar().find(x=>x.id===id);
  if(!s) return;
  _editServicioId=id;
  document.getElementById('add-servicio-title').textContent='Editar servicio';
  document.getElementById('servicio-emoji-input').value=s.emoji;
  document.getElementById('servicio-name-input').value=s.name;
  document.getElementById('servicio-day-input').value=s.day;
  document.getElementById('add-servicio-overlay').classList.add('open');
}
function closeAddServicioModal(e){
  if(e&&e.target!==document.getElementById('add-servicio-overlay')) return;
  document.getElementById('add-servicio-overlay').classList.remove('open');
  _editServicioId=null;
}
function confirmSaveServicio(){
  const emoji=document.getElementById('servicio-emoji-input').value.trim()||'🏠';
  const name=document.getElementById('servicio-name-input').value.trim();
  const day=Math.min(31,Math.max(1,parseInt(document.getElementById('servicio-day-input').value)||5));
  if(!name){showToast('Ingresa un nombre','var(--yellow)');return;}
  const servicios=getServiciosHogar();
  if(_editServicioId){
    const idx=servicios.findIndex(s=>s.id===_editServicioId);
    if(idx>=0){servicios[idx]={...servicios[idx],emoji,name,day};}
  } else {
    const id='serv_'+Date.now();
    servicios.push({id,emoji,name,day});
  }
  saveServiciosHogar(servicios);
  document.getElementById('add-servicio-overlay').classList.remove('open');
  _editServicioId=null;
  renderServiciosAjustes();
  showToast('✅ Servicio guardado');
}
function deleteServicio(id){
  saveServiciosHogar(getServiciosHogar().filter(s=>s.id!==id));
  renderServiciosAjustes();
  showToast('Servicio eliminado');
}

function renderCategoriasAjustes(){
  const cats=getCategorias();
  const rules=getCatRules();
  // Render categories list
  const catList=document.getElementById('categorias-list');
  if(catList){
    catList.innerHTML=cats.map(c=>`
      <div class="settings-row" style="gap:10px">
        <span style="font-size:18px">${esc(c.emoji)}</span>
        <span class="row-label" style="flex:1">${esc(c.name)}</span>
        <span style="width:14px;height:14px;border-radius:50%;background:${esc(c.color)};display:inline-block;flex-shrink:0"></span>
        <button onclick="openEditCatModal('${escJsAttr(c.id)}')" style="background:none;border:none;color:var(--text2);font-size:13px;cursor:pointer;padding:4px 6px">✏️</button>
        <button onclick="deleteCat('${escJsAttr(c.id)}')" style="background:none;border:none;color:var(--red);font-size:13px;cursor:pointer;padding:4px 6px">🗑️</button>
      </div>`).join('');
  }
  // Render rules list
  const ruleList=document.getElementById('cat-rules-list');
  if(ruleList){
    ruleList.innerHTML=rules.length?rules.map((r,i)=>{
      const cat=getCatById(r.catId);
      return `<div class="settings-row" style="gap:10px">
        <span style="font-size:16px">${cat?esc(cat.emoji):'❓'}</span>
        <span class="row-label" style="flex:1">"${esc(r.keyword)}" → ${cat?esc(cat.name):'Desconocida'}</span>
        <button onclick="deleteRule(${i})" style="background:none;border:none;color:var(--red);font-size:13px;cursor:pointer;padding:4px 6px">🗑️</button>
      </div>`;
    }).join(''):'<div style="padding:8px 0;color:var(--text2);font-size:13px">Sin reglas aún. Agrega una para auto-categorizar cartolas.</div>';
  }
}

function openAddCatModal(){
  _editCatId=null;
  document.getElementById('add-cat-title').textContent='Nueva categoría';
  document.getElementById('cat-emoji-input').value='';
  document.getElementById('cat-name-input').value='';
  renderColorPicker(CAT_COLORS[0]);
  document.getElementById('add-cat-overlay').classList.add('open');
}
function openEditCatModal(id){
  const cat=getCatById(id);
  if(!cat) return;
  _editCatId=id;
  document.getElementById('add-cat-title').textContent='Editar categoría';
  document.getElementById('cat-emoji-input').value=cat.emoji;
  document.getElementById('cat-name-input').value=cat.name;
  renderColorPicker(cat.color);
  document.getElementById('add-cat-overlay').classList.add('open');
}
function closeAddCatModal(e){
  if(e&&e.target!==document.getElementById('add-cat-overlay')) return;
  document.getElementById('add-cat-overlay').classList.remove('open');
  _editCatId=null;
}
let _selectedCatColor=CAT_COLORS[0];
function renderColorPicker(selected){
  _selectedCatColor=selected;
  document.getElementById('cat-color-picker').innerHTML=CAT_COLORS.map(c=>`
    <div onclick="selectCatColor('${c}')" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===selected?'#fff':'transparent'};box-sizing:border-box"></div>
  `).join('');
}
function selectCatColor(color){
  renderColorPicker(color);
}
function confirmSaveCat(){
  const emoji=document.getElementById('cat-emoji-input').value.trim()||'📦';
  const name=document.getElementById('cat-name-input').value.trim();
  if(!name){showToast('Ingresa un nombre','var(--yellow)');return;}
  const color=_selectedCatColor;
  const cats=getCategorias();
  if(_editCatId){
    const idx=cats.findIndex(c=>c.id===_editCatId);
    if(idx>=0){cats[idx]={...cats[idx],emoji,name,color};}
  } else {
    const id='cat_'+Date.now();
    cats.push({id,name,emoji,color});
  }
  saveCategorias(cats);
  document.getElementById('add-cat-overlay').classList.remove('open');
  _editCatId=null;
  renderCategoriasAjustes();
  showToast('✅ Categoría guardada');
}
function deleteCat(id){
  const cats=getCategorias().filter(c=>c.id!==id);
  saveCategorias(cats);
  // Remove rules referencing this cat
  const rules=getCatRules().filter(r=>r.catId!==id);
  saveCatRules(rules);
  renderCategoriasAjustes();
  showToast('Categoría eliminada');
}

function openAddRuleModal(){
  document.getElementById('rule-keyword-input').value='';
  const cats=getCategorias();
  document.getElementById('rule-cat-select').innerHTML=cats.map(c=>`<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  document.getElementById('add-rule-overlay').classList.add('open');
}
function closeAddRuleModal(e){
  if(e&&e.target!==document.getElementById('add-rule-overlay')) return;
  document.getElementById('add-rule-overlay').classList.remove('open');
}
function confirmSaveRule(){
  const keyword=document.getElementById('rule-keyword-input').value.trim();
  const catId=document.getElementById('rule-cat-select').value;
  if(!keyword){showToast('Ingresa una palabra clave','var(--yellow)');return;}
  const rules=getCatRules();
  rules.push({keyword,catId});
  saveCatRules(rules);
  document.getElementById('add-rule-overlay').classList.remove('open');
  renderCategoriasAjustes();
  // Ofrecer aplicar la regla recien creada a compras existentes SIN categoria que coincidan
  const n=applyRuleToUncategorized(keyword,catId);
  if(!n) showToast('✅ Regla guardada');
}
// Aplica una regla a las transacciones existentes que NO tienen categoria y cuya
// descripcion coincide con la palabra clave. Pregunta antes y nunca sobrescribe
// categorias ya asignadas manualmente. Devuelve cuantas clasifico (0 si ninguna).
function applyRuleToUncategorized(keyword,catId){
  const kw=keyword.toLowerCase();
  const match=t=>!t.catId && (t.desc||'').toLowerCase().includes(kw);
  const n=getC().filter(match).length+getD().filter(match).length;
  if(n===0) return 0;
  const cat=getCatById(catId);
  const catName=cat?`${cat.emoji} ${cat.name}`:'esta categoría';
  if(!confirm(`Encontré ${n} compra${n!==1?'s':''} sin categoría que coincide${n!==1?'n':''} con "${keyword}".\n\n¿Clasificarla${n!==1?'s':''} ahora como ${catName}?`)) return 0;
  const c=getC(); c.forEach(t=>{ if(match(t)) t.catId=catId; }); saveC(c);
  const d=getD(); d.forEach(t=>{ if(match(t)) t.catId=catId; }); saveD(d);
  renderDashboard(); renderDebito(); renderHistorial();
  showToast(`✅ ${n} gasto${n!==1?'s':''} clasificado${n!==1?'s':''} como ${catName}`);
  return n;
}
function deleteRule(idx){
  const rules=getCatRules();
  rules.splice(idx,1);
  saveCatRules(rules);
  renderCategoriasAjustes();
  showToast('Regla eliminada');
}

function updateBillingDate(cardId, val){
  const d=getBillingDates();
  d[cardId]=Math.min(31,Math.max(1,parseInt(val)||1));
  saveBillingDates(d);
  showToast('Fecha de cierre actualizada');
}

function getPaymentDates(){try{return JSON.parse(localStorage.getItem('misgastos_payment_dates')||'{}')}catch{return{}}}
function savePaymentDates(d){localStorage.setItem('misgastos_payment_dates',JSON.stringify(d));syncSettingsToCloud()}
function getPaidFlags(){try{return JSON.parse(localStorage.getItem('misgastos_paid_flags')||'{}')}catch{return{}}}
function savePaidFlags(d){localStorage.setItem('misgastos_paid_flags',JSON.stringify(d));syncSettingsToCloud()}

// ── Servicios del hogar (Arriendo, Agua, Luz, etc.) ────────────────────────
const LS_SERVICIOS='misgastos_servicios_hogar_v1';
const DEFAULT_SERVICIOS=[
  {id:'arriendo',emoji:'🏠',name:'Arriendo',day:5},
  {id:'gastoscomunes',emoji:'🏢',name:'Gastos Comunes',day:5},
  {id:'agua',emoji:'💧',name:'Agua',day:12},
  {id:'luz',emoji:'💡',name:'Luz',day:15},
  {id:'internet',emoji:'📶',name:'Internet',day:10},
  {id:'club',emoji:'🏋️',name:'Club',day:8},
  {id:'tag',emoji:'🚗',name:'Tag',day:20},
];
function getServiciosHogar(){try{const s=localStorage.getItem(LS_SERVICIOS);return s?JSON.parse(s):DEFAULT_SERVICIOS.map(s=>({...s}))}catch{return DEFAULT_SERVICIOS.map(s=>({...s}))}}
function saveServiciosHogar(a){localStorage.setItem(LS_SERVICIOS,JSON.stringify(a));syncCollectionToCloud('household_services',a)}
function getServiciosPaidFlags(){try{return JSON.parse(localStorage.getItem('misgastos_servicios_paid_flags')||'{}')}catch{return{}}}
function saveServiciosPaidFlags(d){localStorage.setItem('misgastos_servicios_paid_flags',JSON.stringify(d));syncSettingsToCloud()}
function updatePaymentDate(cardId,val){
  const d=getPaymentDates();
  d[cardId]=Math.min(31,Math.max(1,parseInt(val)||1));
  savePaymentDates(d);
  showToast('Día de pago actualizado');
}
function checkPaymentReminder(){
  const now=new Date(),day=now.getDate();
  const monthKey=now.getFullYear()+'-'+(now.getMonth()+1);
  const payDates=getPaymentDates(),paidFlags=getPaidFlags();
  const pendientes=Object.values(CARDS).filter(c=>{
    const payDay=payDates[c.id]||5;
    if(day>payDay) return false;
    if(paidFlags[c.id+'_'+monthKey]) return false;
    const saldo=cuotaCicloCLP(c.id,-1); // cuotas a pagar del ciclo cerrado (con arrastre)
    return saldo>0;
  });
  if(!pendientes.length) return;
  const payDates2=getPaymentDates();
  document.getElementById('payment-reminder-list').innerHTML=pendientes.map(c=>{
    const saldo=cuotaCicloCLP(c.id,-1);
    const payDay=payDates2[c.id]||5;
    const rowId='paid-btn-'+c.id;
    return `<div class="payment-card-row"><div class="payment-card-info"><span class="payment-card-name">${c.emoji} ${c.bank}</span><span class="payment-card-amount">${fmtCLP(saldo)} · vence día ${payDay}</span></div><button class="payment-paid-btn" id="${rowId}" onclick="markAsPaid('${c.id}','${monthKey}')">✓ Pagué</button></div>`;
  }).join('');
  document.getElementById('payment-reminder-overlay').classList.add('open');
}
function markAsPaid(cardId,monthKey){
  const flags=getPaidFlags();
  flags[cardId+'_'+monthKey]=true;
  savePaidFlags(flags);
  const btn=document.getElementById('paid-btn-'+cardId);
  if(btn){btn.textContent='✓ Listo';btn.className='payment-paid-btn done';btn.disabled=true;}
  const allDone=[...document.querySelectorAll('.payment-paid-btn')].every(b=>b.disabled);
  if(allDone) setTimeout(closePaymentReminder,800);
}
function closePaymentReminder(){
  document.getElementById('payment-reminder-overlay').classList.remove('open');
  checkCobroReminder();
}
function closePaymentReminderOutside(e){
  if(e.target===document.getElementById('payment-reminder-overlay')) closePaymentReminder();
}
function checkCobroReminder(){
  const day=new Date().getDate();
  if(day>5) return;
  const pend=deudaInstallments().filter(i=>i.section==='anterior'&&!i.paid);
  if(!pend.length) return;
  const byPerson={};
  pend.forEach(i=>{byPerson[i.d.person]=(byPerson[i.d.person]||0)+i.amt;});
  document.getElementById('cobro-reminder-list').innerHTML=Object.entries(byPerson).map(([person,total],i)=>
    `<div class="payment-card-row"><div class="payment-card-info"><span class="payment-card-name">👤 ${esc(person)}</span><span class="payment-card-amount" style="color:var(--accent2)">${fmtCLP(total)}</span></div><button class="payment-paid-btn cobro-paid-btn" id="cobro-btn-${i}" onclick="markPersonCobrado('${escJsAttr(person)}',${i})">✓ Cobrado</button></div>`
  ).join('');
  document.getElementById('cobro-reminder-overlay').classList.add('open');
}
function markPersonCobrado(person,idx){
  const pend=deudaInstallments().filter(i=>i.section==='anterior'&&!i.paid&&i.d.person===person);
  pend.forEach(i=>toggleCuotaPagada(i.d.id,i.k,true));
  const btn=document.getElementById('cobro-btn-'+idx);
  if(btn){btn.textContent='✓ Listo';btn.className='payment-paid-btn done';btn.disabled=true;}
  const allDone=[...document.querySelectorAll('.cobro-paid-btn')].every(b=>b.disabled);
  if(allDone) setTimeout(closeCobroReminder,800);
  renderDeudas();renderDashboard();
}
function closeCobroReminder(){
  document.getElementById('cobro-reminder-overlay').classList.remove('open');
  checkServiciosReminder();
}
function closeCobroReminderOutside(e){
  if(e.target===document.getElementById('cobro-reminder-overlay')) closeCobroReminder();
}

function checkServiciosReminder(){
  const now=new Date(), day=now.getDate();
  const monthKey=now.getFullYear()+'-'+(now.getMonth()+1);
  const paidFlags=getServiciosPaidFlags();
  const servicios=getServiciosHogar();
  const pendientes=servicios.filter(s=>{
    if(day>s.day) return false;
    if(paidFlags[s.id+'_'+monthKey]) return false;
    return true;
  });
  if(!pendientes.length) return;
  document.getElementById('servicios-reminder-list').innerHTML=pendientes.map(s=>
    `<div class="payment-card-row"><div class="payment-card-info"><span class="payment-card-name">${esc(s.emoji)} ${esc(s.name)}</span><span class="payment-card-amount">vence día ${s.day}</span></div><button class="payment-paid-btn servicio-paid-btn" id="serv-btn-${esc(s.id)}" onclick="markServicioPagado('${escJsAttr(s.id)}','${monthKey}')">✓ Pagado</button></div>`
  ).join('');
  document.getElementById('servicios-reminder-overlay').classList.add('open');
}
function markServicioPagado(id,monthKey){
  const flags=getServiciosPaidFlags();
  flags[id+'_'+monthKey]=true;
  saveServiciosPaidFlags(flags);
  const btn=document.getElementById('serv-btn-'+id);
  if(btn){btn.textContent='✓ Listo';btn.className='payment-paid-btn done servicio-paid-btn';btn.disabled=true;}
  const allDone=[...document.querySelectorAll('.servicio-paid-btn')].every(b=>b.disabled);
  if(allDone) setTimeout(closeServiciosReminder,800);
}
function closeServiciosReminder(){
  document.getElementById('servicios-reminder-overlay').classList.remove('open');
  checkSinClasificarReminder();
}
function closeServiciosReminderOutside(e){
  if(e.target===document.getElementById('servicios-reminder-overlay')) closeServiciosReminder();
}

// ── Recordatorio: gastos sin clasificar (credito + debito, cualquier fecha) ──
function checkSinClasificarReminder(){
  const pend=[...getC().map(t=>({...t,_tipo:'credito'})),...getD().map(t=>({...t,_tipo:'debito'}))]
    .filter(t=>!t.catId)
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!pend.length) return;
  const cats=getCategorias();
  const opts=cats.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  document.getElementById('sinclasificar-reminder-list').innerHTML=pend.map((t,i)=>{
    const fecha=new Date(t.date).toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
    const monto=t.currency==='USD'?fmtUSD(t.amount):fmtCLP(t.amount);
    const sugerida=autoCategorize(t.desc)||'';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.desc)||'Sin descripción'}</div>
          <div style="font-size:11px;color:var(--text2)">${t._tipo==='debito'?'Débito':'Crédito'} · ${fecha}</div>
        </div>
        <div style="font-size:13px;font-weight:700;flex-shrink:0">${monto}</div>
      </div>
      <select id="sinclasificar-cat-${i}" data-txid="${esc(t.id)}" data-txtype="${t._tipo}" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px">
        <option value="" ${sugerida?'':'selected'}>Sin categoría</option>
        ${cats.map(c=>`<option value="${esc(c.id)}" ${sugerida===c.id?'selected':''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
  document.getElementById('sinclasificar-count').textContent=pend.length+' gasto'+(pend.length!==1?'s':'');
  document.getElementById('sinclasificar-reminder-overlay').classList.add('open');
}
function confirmClasificarPendientes(){
  const selects=[...document.querySelectorAll('#sinclasificar-reminder-list select')];
  const creditData=getC(), debitData=getD();
  let changed=0, changedC=false, changedD=false;
  selects.forEach(sel=>{
    if(!sel.value) return; // se dejó "Sin categoría": queda pendiente para la próxima
    const txId=sel.getAttribute('data-txid'), txType=sel.getAttribute('data-txtype');
    if(txType==='debito'){
      const idx=debitData.findIndex(t=>t.id===txId);
      if(idx>=0){debitData[idx].catId=sel.value;changedD=true;changed++;}
    } else {
      const idx=creditData.findIndex(t=>t.id===txId);
      if(idx>=0){creditData[idx].catId=sel.value;changedC=true;changed++;}
    }
  });
  if(changedC) saveC(creditData);
  if(changedD) saveD(debitData);
  closeSinClasificarReminder();
  renderDashboard(); renderDebito(); renderHistorial();
  showToast(changed?('✅ '+changed+' gasto'+(changed!==1?'s':'')+' clasificado'+(changed!==1?'s':'')):'Sin cambios');
}
function closeSinClasificarReminder(){
  document.getElementById('sinclasificar-reminder-overlay').classList.remove('open');
}
function closeSinClasificarReminderOutside(e){
  if(e.target===document.getElementById('sinclasificar-reminder-overlay')) closeSinClasificarReminder();
}

// ── Menú contextual (long press / right click) ────────────────────────────
let _txHoldTimer=null;
let _ctxMenu=null;

function startTxHold(e, txId, txType){
  _txHoldTimer=setTimeout(()=>{
    const touch=e.touches[0];
    openTxMenu({clientX:touch.clientX, clientY:touch.clientY, preventDefault:()=>{}}, txId, txType);
  }, 500);
}
function cancelTxHold(){
  if(_txHoldTimer){clearTimeout(_txHoldTimer);_txHoldTimer=null;}
}
function closeCtxMenu(){
  if(_ctxMenu){_ctxMenu.remove();_ctxMenu=null;}
}
function openTxMenu(e, txId, txType){
  e.preventDefault();
  closeCtxMenu();
  const menu=document.createElement('div');
  menu.className='tx-ctx-menu';
  // Aplazar solo para credito (el debito ya esta pagado)
  const off=(txType!=='debito')?((getC().find(t=>t.id===txId)||{}).cycleOffset||0):0;
  const aplazarBtns=(txType!=='debito')
    ? `<button class="tx-ctx-btn" data-act="aplazar">⏳ ${off>0?'Aplazar +1 ciclo':'Aplazar al próximo ciclo'}</button>${off>0?'<button class="tx-ctx-btn" data-act="reactivar">↩️ Reactivar (1 ciclo atrás)</button>':''}`
    : '';
  menu.innerHTML=`
    <button class="tx-ctx-btn" data-act="editar">✏️ Editar</button>
    ${aplazarBtns}
    <button class="tx-ctx-btn danger" data-act="eliminar">🗑️ Eliminar</button>`;
  const x=Math.min(e.clientX, window.innerWidth-200);
  const y=Math.min(e.clientY, window.innerHeight-190);
  menu.style.cssText=`left:${x}px;top:${y}px`;
  document.body.appendChild(menu);
  _ctxMenu=menu;
  const act=a=>{ closeCtxMenu();
    if(a==='editar') openEditModal(txId,txType);
    else if(a==='eliminar') deleteTx(txId,txType);
    else if(a==='aplazar') aplazarCompra(txId,1);
    else if(a==='reactivar') aplazarCompra(txId,-1);
  };
  menu.querySelectorAll('.tx-ctx-btn').forEach(b=>{
    const a=b.getAttribute('data-act');
    b.addEventListener('touchend',(ev)=>{ev.preventDefault();ev.stopPropagation();act(a);});
    b.addEventListener('click',(ev)=>{ev.stopPropagation();act(a);});
  });
  setTimeout(()=>{
    document.addEventListener('touchstart', closeCtxMenu, {once:true});
    document.addEventListener('click', closeCtxMenu, {once:true});
  }, 150);
}

// ── Editar tx ─────────────────────────────────────────────────────────────
let _editTxId=null, _editTxType=null;

function openEditModal(txId, txType){
  closeCtxMenu();
  _editTxId=txId; _editTxType=txType;
  const tx=txType==='debito'
    ? getD().find(t=>t.id===txId)
    : getC().find(t=>t.id===txId);
  if(!tx) return;
  document.getElementById('edit-desc').value=tx.desc||'';
  document.getElementById('edit-amount').value=tx.amount||'';
  populateCatSelect('edit-cat', tx.catId||'');
  const splitSection=document.getElementById('edit-split-section');
  if(tx.splitWith){
    const esPrest=esPrestada(tx);
    splitSection.innerHTML=`
      <div style="background:var(--bg3);border-radius:10px;padding:12px">
        <div style="margin-bottom:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:2px">${esPrest?'🤝 Prestada a (te lo deben)':'Dividido con'}</div>
          <div style="font-size:13px;font-weight:600">👤 ${esc(tx.splitWith)}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="modifySplit()" style="flex:1;padding:7px 10px;border-radius:8px;border:1px solid var(--accent2);background:transparent;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer">✏️ Modificar</button>
          <button onclick="revertSplit()" style="flex:1;padding:7px 10px;border-radius:8px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:12px;font-weight:600;cursor:pointer">Revertir a mío</button>
        </div>
      </div>`;
  } else {
    splitSection.innerHTML=`
      <button onclick="splitExistingTx()" style="width:100%;padding:11px;border-radius:10px;border:1px dashed var(--accent2);background:transparent;color:var(--accent2);font-size:14px;font-weight:600;cursor:pointer">+ Dividir este gasto</button>`;
  }
  document.getElementById('edit-modal-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('edit-desc').focus(), 300);
}
function closeEditModal(){
  document.getElementById('edit-modal-overlay').classList.remove('open');
  _editTxId=null; _editTxType=null;
}
function closeEditModalOutside(e){
  if(e.target===document.getElementById('edit-modal-overlay')) closeEditModal();
}
function confirmEditTx(){
  if(!_editTxId) return;
  const desc=document.getElementById('edit-desc').value.trim();
  const amount=parseFloat(document.getElementById('edit-amount').value);
  if(!desc){showToast('La descripción no puede estar vacía','var(--yellow)');return;}
  if(!amount||amount<=0){showToast('Ingresa un monto válido','var(--yellow)');return;}
  const catId=document.getElementById('edit-cat').value||'';
  if(_editTxType==='debito'){
    const d=getD();
    const idx=d.findIndex(t=>t.id===_editTxId);
    if(idx>=0){d[idx].desc=desc;d[idx].amount=amount;d[idx].catId=catId;saveD(d);}
  } else {
    const c=getC();
    const idx=c.findIndex(t=>t.id===_editTxId);
    if(idx>=0){c[idx].desc=desc;c[idx].amount=amount;c[idx].catId=catId;saveC(c);}
  }
  // Actualizar descripción en deuda asociada si existe
  const deudas=getDeudas();
  const dIdx=deudas.findIndex(d=>d.txId===_editTxId);
  if(dIdx>=0){deudas[dIdx].desc=desc;saveDeudas(deudas);}
  closeEditModal();
  renderDashboard(); renderDebito(); renderHistorial(); renderDeudas();
  showToast('✅ Gasto actualizado');
}

// Guarda en el gasto (y su deuda) la descripcion/monto/categoria que el
// usuario haya escrito en el modal de editar, sin cerrar el modal ni avisar.
// Se llama antes de Dividir/Modificar split/Revertir para no perder lo que
// ya escribio ni operar con datos obsoletos (bug: se perdia la descripcion
// si tocaba "+ Dividir este gasto" sin apretar "Guardar" primero).
function persistEditFormIfValid(){
  if(!_editTxId) return;
  const descEl=document.getElementById('edit-desc'), amtEl=document.getElementById('edit-amount');
  if(!descEl||!amtEl) return;
  const desc=descEl.value.trim();
  const amount=parseFloat(amtEl.value);
  if(!desc||!amount||amount<=0) return; // invalido: no tocar, se usa lo que ya hay guardado
  const catId=document.getElementById('edit-cat')?.value||'';
  if(_editTxType==='debito'){
    const d=getD(); const idx=d.findIndex(t=>t.id===_editTxId);
    if(idx>=0){d[idx].desc=desc;d[idx].amount=amount;d[idx].catId=catId;saveD(d);}
  } else {
    const c=getC(); const idx=c.findIndex(t=>t.id===_editTxId);
    if(idx>=0){c[idx].desc=desc;c[idx].amount=amount;c[idx].catId=catId;saveC(c);}
  }
  const deudas=getDeudas();
  const dIdx=deudas.findIndex(d=>d.txId===_editTxId);
  if(dIdx>=0 && deudas[dIdx].desc!==desc){ deudas[dIdx].desc=desc; saveDeudas(deudas); }
}

function revertSplit(){
  if(!confirm('¿Revertir la división? El gasto quedará a tu nombre completo y se eliminará la deuda asociada.')) return;
  const txId=_editTxId, txType=_editTxType;
  persistEditFormIfValid();
  if(txType==='debito'){
    const d=getD();
    const idx=d.findIndex(t=>t.id===txId);
    if(idx>=0){d[idx].amount=d[idx].splitTotal||d[idx].amount;delete d[idx].splitWith;delete d[idx].splitTotal;delete d[idx].lent;saveD(d);}
  } else {
    const c=getC();
    const idx=c.findIndex(t=>t.id===txId);
    if(idx>=0){c[idx].amount=c[idx].splitTotal||c[idx].amount;delete c[idx].splitWith;delete c[idx].splitTotal;delete c[idx].lent;saveC(c);}
  }
  saveDeudas(getDeudas().filter(d=>d.txId!==txId));
  closeEditModal();
  renderDashboard();renderDebito();renderHistorial();renderDeudas();
  showToast('Gasto revertido a tu nombre ✓');
}
function splitExistingTx(){
  const txId=_editTxId, txType=_editTxType;
  persistEditFormIfValid();
  const tx=txType==='debito'?getD().find(t=>t.id===txId):getC().find(t=>t.id===txId);
  if(!tx) return;
  closeEditModal();
  _pendingSplit={txId,amount:tx.amount,desc:tx.desc,cuotas:tx.cuotas||1,currency:tx.currency||'CLP',cardId:txType==='debito'?tx.bank:tx.cardId,type:txType,txDate:tx.date};
  openSplitModal(_pendingSplit);
}
function modifySplit(){
  const txId=_editTxId, txType=_editTxType;
  persistEditFormIfValid();
  // Restaurar monto original sin pedir confirmación
  let fullAmount;
  if(txType==='debito'){
    const d=getD();const idx=d.findIndex(t=>t.id===txId);
    if(idx<0) return;
    fullAmount=d[idx].splitTotal||d[idx].amount;
    d[idx].amount=fullAmount;delete d[idx].splitWith;delete d[idx].splitTotal;delete d[idx].lent;saveD(d);
  } else {
    const c=getC();const idx=c.findIndex(t=>t.id===txId);
    if(idx<0) return;
    fullAmount=c[idx].splitTotal||c[idx].amount;
    c[idx].amount=fullAmount;delete c[idx].splitWith;delete c[idx].splitTotal;delete c[idx].lent;saveC(c);
  }
  saveDeudas(getDeudas().filter(d=>d.txId!==txId));
  const tx=txType==='debito'?getD().find(t=>t.id===txId):getC().find(t=>t.id===txId);
  closeEditModal();
  _pendingSplit={txId,amount:fullAmount,desc:tx?.desc||'',cuotas:tx?.cuotas||1,currency:tx?.currency||'CLP',cardId:txType==='debito'?tx?.bank:tx?.cardId,type:txType,txDate:tx?.date};
  openSplitModal(_pendingSplit);
}
// ── Eliminar tx ───────────────────────────────────────────────────────────
function deleteTx(txId, txType){
  closeCtxMenu();
  if(!confirm('¿Eliminar este gasto?')) return;
  if(txType==='debito'){
    saveD(getD().filter(t=>t.id!==txId));
  } else {
    saveC(getC().filter(t=>t.id!==txId));
  }
  // También eliminar deuda asociada si existe
  saveDeudas(getDeudas().filter(d=>d.txId!==txId));
  renderDashboard(); renderDebito(); renderHistorial(); renderDeudas();
  showToast('Gasto eliminado');
}

function txHTML(t){
  const isD=t._isDebit||t.bank!==undefined&&t.cardId===undefined;
  const c=isD?null:CARDS[t.cardId];
  const color=isD?'var(--blue)':(c?.color||'#888');
  const bank=isD?(t.bank?CARDS[t.bank]?.bank||t.bank:'Cuenta Corriente'):(c?.bank||'');
  const date=new Date(t.date).toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
  // Filas expandidas por cuotasMensuales (detalle de Analisis): muestran la
  // cuota del mes (monto mensual + "cuota k/n"), no la compra completa.
  const esCuota=!isD&&t._cuotaTotal>1;
  const _vd=getValorDolar();
  // USD: monto en dolares y, si hay valor definido, estimado en pesos al lado
  const amtUSD=fmtUSD(t.amount)+(_vd>0?` <span style="font-size:10px;color:var(--text2);font-weight:400">≈ ${fmtCLP(t.amount*_vd)}</span>`:'');
  const amt=esCuota&&t.currency==='CLP'?fmtCLP(t._monto):(t.currency==='USD'?amtUSD:fmtCLP(t.amount));
  const cuota=esCuota?('cuota '+t._cuotaNum+'/'+t._cuotaTotal):(!isD&&t.cuotas>1?t.cuotas+' cuotas':(isD?'Débito':'Contado'));
  const txType=isD?'debito':'credito';
  return`<div class="tx-item ${isD?'debito':''}" oncontextmenu="openTxMenu(event,'${escJsAttr(t.id)}','${txType}')" ontouchstart="startTxHold(event,'${escJsAttr(t.id)}','${txType}')" ontouchend="cancelTxHold()" ontouchmove="cancelTxHold()">
    <div class="tx-icon" style="background:${color}22">${getIcon(t.desc)}</div>
    <div class="tx-info"><div class="tx-name">${esc(t.desc)||'Sin descripción'}${esPrestada(t)?' <span style="font-size:9px;font-weight:700;color:var(--accent2);background:rgba(167,139,250,.15);padding:1px 6px;border-radius:6px;vertical-align:middle">🤝 PRESTADA</span>':''}${!isD?aplazadaTag(t.cycleOffset||0):''}</div><div class="tx-meta">${esc(bank)} · ${date}</div></div>
    <div class="tx-amount"><div class="amount" style="color:${esPrestada(t)?'var(--text2)':(t.amount<0?'var(--green)':(isD?'var(--blue)':'var(--text)'))}">${amt}</div><div class="cuotas">${esPrestada(t)?'por cobrar':cuota}</div></div>
  </div>`;
}

let modalTab='credito';
function switchModalTab(tab){
  modalTab=tab;
  document.getElementById('tab-credito').className='modal-tab'+(tab==='credito'?' active':'');
  document.getElementById('tab-debito').className='modal-tab'+(tab==='debito'?' active':'');
  document.getElementById('fields-credito').style.display=tab==='credito'?'':'none';
  document.getElementById('fields-debito').style.display=tab==='debito'?'':'none';
}
function populateCatSelect(selectId, selectedId){
  const cats=getCategorias();
  const sel=document.getElementById(selectId);
  if(!sel) return;
  sel.innerHTML='<option value="">Sin categoría</option>'+cats.map(c=>`<option value="${esc(c.id)}" ${c.id===selectedId?'selected':''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
}
function openModal(){
  // Fecha de hoy en formato YYYY-MM-DD que requiere input type=date
  const hoy=new Date();
  const yyyy=hoy.getFullYear();
  const mm=String(hoy.getMonth()+1).padStart(2,'0');
  const dd=String(hoy.getDate()).padStart(2,'0');
  document.getElementById('m-date').value=`${yyyy}-${mm}-${dd}`;
  populateCatSelect('m-cat','');
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('m-amount').focus(),300);
  // Auto-categorize on desc blur
  const descEl=document.getElementById('m-desc');
  descEl.onblur=function(){
    const auto=autoCategorize(this.value);
    if(auto) document.getElementById('m-cat').value=auto;
  };
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('m-amount').value='';
  document.getElementById('m-desc').value='';
  document.getElementById('m-date').value='';
}
function closeModalOutside(e){if(e.target===document.getElementById('modal-overlay'))closeModal();}

// Pending split data
let _pendingSplit=null;
let _splitQueue=[];
let _splitImportMode=false; // true cuando viene de importación de cartola

function processSplitQueue(){
  if(_splitQueue.length===0) return;
  const next=_splitQueue.shift();
  _pendingSplit=next;
  openSplitModal(next);
}

function saveExpense(){
  const amount=parseFloat(document.getElementById('m-amount').value);
  const desc=(document.getElementById('m-desc').value.trim())||'Sin descripción';
  if(!amount||amount<=0){showToast('Ingresa un monto válido','var(--yellow)');return}
  // Fecha: usar la del campo, o hoy si está vacío
  const dateVal=document.getElementById('m-date').value;
  const txDate=dateVal?new Date(dateVal+'T12:00:00').toISOString():new Date().toISOString();
  if(modalTab==='credito'){
    const cardId=document.getElementById('m-card').value;
    const cuotas=parseInt(document.getElementById('m-cuotas').value);
    const currency=document.getElementById('m-currency').value;
    const txId=Date.now().toString();
    const catId=document.getElementById('m-cat').value||'';
    const d=getC();
    d.push({id:txId,cardId,amount,desc,cuotas,currency,date:txDate,source:'manual',catId});
    saveC(d);
    closeModal(); renderDashboard();
    _pendingSplit={txId,amount,desc,cuotas,currency,cardId,txDate};
    openSplitModal(_pendingSplit);
  }else{
    const bank=document.getElementById('m-debit-bank').value;
    const txId=Date.now().toString();
    const catId=document.getElementById('m-cat').value||'';
    const d=getD();
    d.push({id:txId,bank,amount,desc,currency:'CLP',date:txDate,source:'manual',catId});
    saveD(d);
    closeModal(); renderDashboard();
    _pendingSplit={txId,amount,desc,cuotas:1,currency:'CLP',cardId:bank,type:'debito',txDate};
    openSplitModal(_pendingSplit);
  }
}

// ── Split modal logic ──────────────────────────────────────────────────────
let _splitSelectedPersons=[];
let _splitLent=false; // true = "presté mi tarjeta": el 100% es deuda de la persona, no gasto mio
function toggleSplitLent(){ _splitLent=document.getElementById('split-lent').checked; updateSplitPreview(); }

// Matematica UNICA de una division (usada por el preview, confirmSplit y
// splitApplyAll: si cambia el reparto/redondeo, cambia solo aqui y los tres
// siempre cuadran). lent=true = "preste la tarjeta": tu parte es $0, el reparto
// va solo entre las personas y la tx conserva su monto completo.
function calcularSplit(amount, cuotas, type, nPersonas, lent){
  const esDebito=(type||'credito')==='debito';
  const cuotasReal=esDebito?1:Math.max(1,cuotas||1); // debito no tiene cuotas
  const cuotaAmt=amount/cuotasReal;
  const totalParticipants=lent?nPersonas:nPersonas+1;
  const userSharePerCuota=lent?0:cuotaAmt/(nPersonas+1);
  const personSharePerCuota=lent?(nPersonas>0?cuotaAmt/nPersonas:0):cuotaAmt/(nPersonas+1);
  const userTotal=lent?amount:userSharePerCuota*cuotasReal;
  return {esDebito,cuotasReal,cuotaAmt,totalParticipants,userSharePerCuota,personSharePerCuota,userTotal};
}

// Aplica una division ya decidida: actualiza la tx (monto = tu parte, splitWith,
// splitTotal, lent) y crea una deuda por persona. No renderiza ni notifica;
// devuelve el calculo para que el llamador arme su toast.
function aplicarSplit(item, personas, lent){
  const s=calcularSplit(item.amount, item.cuotas, item.type, personas.length, lent);
  const txData=s.esDebito?getD():getC();
  const idx=txData.findIndex(t=>t.id===item.txId);
  if(idx>=0){
    txData[idx].amount=s.userTotal;
    txData[idx].splitWith=personas.join(', ');
    txData[idx].splitTotal=item.amount;
    if(lent) txData[idx].lent=true; else delete txData[idx].lent;
    (s.esDebito?saveD:saveC)(txData);
  }
  const ds=getDeudas();
  personas.forEach(person=>{
    ds.push({id:'deu_'+Date.now()+'_'+Math.random().toString(36).slice(2),
      person,txId:item.txId,desc:item.desc,
      type:s.esDebito?'debito':'credito',
      totalAmount:item.amount,cuotas:s.cuotasReal,
      deudaPerCuota:s.personSharePerCuota,deudaTotal:s.personSharePerCuota*s.cuotasReal,
      currency:item.currency||'CLP',date:item.txDate||new Date().toISOString(),
      paid:false,paidDate:null});
  });
  saveDeudas(ds);
  return s;
}

function updateSplitPreview(){
  if(!_pendingSplit) return;
  const split=_pendingSplit;
  const n=_splitSelectedPersons.length;
  const s=calcularSplit(split.amount, split.cuotas, split.type, n, _splitLent);
  const esDebito=s.esDebito, cuotas=s.cuotasReal, cuotaAmt=s.cuotaAmt;
  const total=s.totalParticipants;       // prestada: tu parte es $0, no cuentas en el reparto
  const userShare=s.userSharePerCuota;
  const personShare=s.personSharePerCuota;
  const tipoLabel=esDebito?'💳 Débito':'💳 Crédito';
  const splitLabel=_splitLent?'0%':(n+1===2?'50%':'1/'+(n+1));
  document.getElementById('split-preview-box').innerHTML=`
    <div class="sp-row"><span class="sp-label">${tipoLabel}</span><span class="sp-val" style="font-size:0.8em;opacity:0.7">${esc(split.desc)}</span></div>
    <div class="sp-row"><span class="sp-label">Monto total</span><span class="sp-val">${fmtCLP(split.amount)}${!esDebito&&cuotas>1?' ('+cuotas+' cuotas)':''}</span></div>
    ${!esDebito&&cuotas>1?`<div class="sp-row"><span class="sp-label">Cuota mensual</span><span class="sp-val yellow">${fmtCLP(cuotaAmt)}</span></div>`:''}
    <div class="sp-row"><span class="sp-label">Tu parte (${splitLabel})</span><span class="sp-val green">${fmtCLP(userShare)}</span></div>
    ${n>0?`<div class="sp-row"><span class="sp-label">Cada persona debe${n>1?' (c/u)':''}</span><span class="sp-val" style="color:var(--accent2)">${fmtCLP(personShare)}</span></div>`:''}
    ${n>1?`<div class="sp-row"><span class="sp-label">Total a cobrar (${n} personas)</span><span class="sp-val" style="color:var(--accent2)">${fmtCLP(personShare*n)}</span></div>`:''}
    ${_splitLent&&n===0?`<div class="sp-row"><span class="sp-label" style="color:var(--yellow)">Selecciona la persona a la que prestaste</span></div>`:''}`;
  const btn=document.getElementById('btn-confirm-split');
  if(btn) btn.textContent=_splitLent?(n===1?'Asignar 100% a '+_splitSelectedPersons[0]:'Asignar 100% ('+n+' personas)'):(n===0?'Dividir':total===2?'Dividir 50/50':'Dividir en '+total);
}

function openSplitModal(split){
  const primero=getPersonas()[0]||'Mi pareja';
  _splitSelectedPersons=[primero];
  // Resetear el modo "presté mi tarjeta" cada vez que se abre
  _splitLent=false;
  const lentChk=document.getElementById('split-lent'); if(lentChk) lentChk.checked=false;
  // Ocultar el toggle en modo importación (no aplica a una cartola completa)
  const lentRow=document.getElementById('split-lent-row'); if(lentRow) lentRow.style.display=_splitImportMode?'none':'flex';
  renderPersonChips();
  updateSplitPreview();
  document.getElementById('split-new-person').value='';
  // Mostrar botones "Aplicar a todos/ninguno" solo en modo importación y si hay más de 1 en cola
  const importActions=document.getElementById('split-import-actions');
  if(_splitImportMode && _splitQueue.length>0){
    importActions.style.display='block';
  } else {
    importActions.style.display='none';
  }
  document.getElementById('split-modal-overlay').classList.add('open');
}

function splitApplyAll(){
  confirmSplit();
  const personas=_splitSelectedPersons.length?_splitSelectedPersons:[getPersonas()[0]||'Mi pareja'];
  // Misma matematica y aplicacion que confirmSplit (en importacion no hay "prestada")
  while(_splitQueue.length>0){
    aplicarSplit(_splitQueue.shift(), personas, false);
  }
  _splitImportMode=false;_splitQueue=[];
  renderDashboard();
  showToast('✅ Todos los gastos divididos en '+(personas.length+1)+' con '+personas.join(' y '));
}

function splitApplyNone(){
  // Cerrar sin dividir este ni los restantes
  document.getElementById('split-modal-overlay').classList.remove('open');
  _pendingSplit=null;
  _splitQueue=[];
  _splitImportMode=false;
  showToast('Gastos guardados sin dividir');
}

function renderPersonChips(){
  const personas=getPersonas();
  document.getElementById('person-chips').innerHTML=personas.map(p=>
    `<button class="person-chip ${_splitSelectedPersons.includes(p)?'active':''}" onclick="selectPerson('${escJsAttr(p)}')">👤 ${esc(p)}</button>`
  ).join('');
}

function selectPerson(name){
  const idx=_splitSelectedPersons.indexOf(name);
  if(idx>=0) _splitSelectedPersons.splice(idx,1);
  else _splitSelectedPersons.push(name);
  renderPersonChips();
  updateSplitPreview();
}
function addPersonToSplit(){
  const input=document.getElementById('split-new-person');
  const name=input.value.trim();
  if(!name) return;
  const ps=getPersonas();
  if(!ps.includes(name)){ps.push(name);savePersonas(ps);}
  if(!_splitSelectedPersons.includes(name)) _splitSelectedPersons.push(name);
  input.value='';
  renderPersonChips();
  updateSplitPreview();
}

function closeSplitModal(){
  document.getElementById('split-modal-overlay').classList.remove('open');
  _pendingSplit=null;
  showToast('Gasto guardado (sin dividir)');
  // Procesar siguiente en cola si hay más
  if(_splitQueue.length>0){
    setTimeout(processSplitQueue, 800);
  } else {
    _splitImportMode=false;
  }
}
function closeSplitOutside(e){if(e.target===document.getElementById('split-modal-overlay'))closeSplitModal();}

function confirmSplit(){
  if(!_pendingSplit)return;
  const newP=document.getElementById('split-new-person').value.trim();
  if(newP){
    const ps=getPersonas();
    if(!ps.includes(newP)){ps.push(newP);savePersonas(ps);}
    if(!_splitSelectedPersons.includes(newP)) _splitSelectedPersons.push(newP);
  }
  if(!_splitSelectedPersons.length){showToast('Selecciona al menos una persona','var(--yellow)');return}

  const amount=_pendingSplit.amount;
  const esPrestado=_splitLent;
  // Actualiza el gasto y crea las deudas con la matematica unica del split.
  const s=aplicarSplit(_pendingSplit, _splitSelectedPersons, esPrestado);

  document.getElementById('split-modal-overlay').classList.remove('open');
  _pendingSplit=null;
  renderDashboard();
  const n=_splitSelectedPersons.length;
  const names=_splitSelectedPersons.join(' y ');
  showToast(esPrestado?'🤝 Prestada a '+names+' — te deben '+fmtCLP(amount):'💜 Dividido en '+(n+1)+' con '+names+' — '+fmtCLP(s.personSharePerCuota)+'/cuota c/u');
  // Procesar siguiente en cola si hay más
  if(_splitQueue.length>0){
    setTimeout(processSplitQueue, 800);
  } else {
    _splitImportMode=false;
  }
}

window.addExpenseFromShortcut=function(cardId,amount,desc,cuotas,currency){
  const d=getC();
  d.push({id:Date.now().toString(),cardId:cardId||'bci',amount:parseFloat(amount)||0,
    desc:desc||'Gasto automático',cuotas:parseInt(cuotas)||1,currency:currency||'CLP',
    date:new Date().toISOString(),source:'shortcut'});
  saveC(d); renderDashboard(); return'OK';
};
window.parseEmailBCI=function(body){
  // Monto: nacional "Monto $75.462" o internacional "Monto USD 23,80" (compra en
  // comercio internacional). Mismo formato de numero chileno (punto=miles, coma=
  // decimal); solo cambia el prefijo y la moneda. Antes solo se leia el formato con
  // "$" en pesos, por eso los cobros en dolares (ej. Anthropic, OpenAI) no entraban.
  const um=body.match(/Monto\s*USD\s*([\d.,]+)/i)||body.match(/\bUSD\s*([\d.,]+)/i);
  const cm2=body.match(/Monto\s*\$?\s*([\d.,]+)/i)||body.match(/\$\s*([\d.,]+)/);
  const m=um||cm2;
  if(!m)return null;
  const currency=um?'USD':'CLP';
  const amount=parseFloat(m[1].replace(/\./g,'').replace(',','.'));
  // Comercio: todo lo que viene después de "Comercio" hasta salto de línea o "Cuotas"
  const cm=body.match(/Comercio\s+([^\n\r]+?)(?:\s*(?:Cuotas|$))/is)||body.match(/Comercio\s+([^\n\r]+)/i);
  const desc=cm?cm[1].trim().replace(/\s+/g,' '):'BCI';
  // Cuotas: 0 o vacío = 1 cuota
  const qm=body.match(/Cuotas\s+(\d+)/i);
  const cuotas=qm?Math.max(1,parseInt(qm[1])):1;
  return window.addExpenseFromShortcut('bci',amount,desc,cuotas,currency);
};
window.parseEmailBancoChile=function(body){
  const m=body.match(/compra por \$([\d.,]+) con Tarjeta de Credito \*+(\d+) en (.+?) el/i);
  if(!m)return null;
  return window.addExpenseFromShortcut('bchile',parseFloat(m[1].replace(/\./g,'').replace(',','.')),m[3].trim(),1,'CLP');
};
window.parseEmailBCIDebito=function(body){
  // Formato: "Monto $4.000", "Fecha 26/04/2026", "Comercio BELFORTPERON"
  const mm=body.match(/Monto\s+\$?([\d.,]+)/i)||body.match(/\$([\d.,]+)/);
  const cm=body.match(/Comercio\s+([^\n\r]+)/i);
  const fm=body.match(/Fecha\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if(!mm) return null;
  const amount=parseFloat(mm[1].replace(/\./g,'').replace(',','.'));
  const desc=(cm?cm[1].trim():'Débito BCI');
  const date=fm?parseFecha(fm[1]):new Date();
  const tx={
    id:Date.now().toString(), bank:'bci', amount, desc,
    currency:'CLP', date:(date||new Date()).toISOString(), source:'shortcut'
  };
  const d=getD(); d.push(tx); saveD(d); renderDashboard(); return'OK';
};

function copyApiInfo(){
  navigator.clipboard.writeText(
    '// BCI Crédito\nwindow.parseEmailBCI(emailBody);\n\n'+
    '// BCI Débito\nwindow.parseEmailBCIDebito(emailBody);\n\n'+
    '// Banco Chile Crédito\nwindow.parseEmailBancoChile(emailBody);\n\n'+
    '// Manual crédito\nwindow.addExpenseFromShortcut(\'bci\', 52900, \'COMERCIO\', 1, \'CLP\');'
  )
    .then(()=>showToast('Código copiado'));
}
function exportData(){
  const backup={};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);backup[k]=localStorage.getItem(k);}
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='misgastos_backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  showToast('Respaldo completo exportado ✓');
}
function importData(){
  const input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.onchange=function(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=function(ev){
      try{
        const backup=JSON.parse(ev.target.result);
        if(!confirm('Esto reemplazará todos tus datos actuales con el respaldo. ¿Continuar?'))return;
        Object.keys(backup).forEach(k=>localStorage.setItem(k,backup[k]));
        // Si hay sesión activa, sincroniza el respaldo restaurado hacia la nube
        // (incluye borrados: lo que no esté en el respaldo se borra también en Firestore).
        if(window._fb&&window._fb.syncEnabled){
          // allowBulk: restaurar un respaldo es explicito y puede reducir colecciones
          Object.keys(CLOUD_MAP).forEach(collName=>syncCollectionToCloud(collName,LOCAL_GETTERS[collName](),{allowBulk:true}));
          syncSettingsToCloud();
        }
        showToast('Respaldo restaurado ✓');
        setTimeout(()=>location.reload(),1500);
      }catch(err){showToast('Error al leer el archivo','var(--red)');}
    };
    reader.readAsText(file);
  };
  input.click();
}
function clearData(){
  if(confirm('¿Borrar TODOS tus gastos de crédito y débito?\n\nTambién se eliminarán las deudas/divisiones asociadas (dependen de esos gastos).\n\nTus categorías, reglas, personas y configuración NO se borran.\n\nEsta acción no se puede deshacer.')){
    // allowBulk: es un vaciado EXPLICITO del usuario, salta el guard anti-borrado
    saveC([],{allowBulk:true});saveD([],{allowBulk:true});saveDeudas([],{allowBulk:true});
    renderDashboard();renderDebito();renderHistorial();renderDeudas();
    showToast('Gastos eliminados','var(--red)');
  }
}
function showToast(msg,color){
  color=color||'var(--green)';
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.background=color;
  t.style.color=color==='var(--green)'?'#0f1117':'white';
  t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2800);
}
// ── Sincronización desde Google Apps Script API ───────────────────────────────
const APPS_SCRIPT_URL='https://script.google.com/macros/s/AKfycbwxWhRJehKodrfiPFu5iG6gwaMq2JtX6sRwm5ngKTjduB2v6W2d14p-WD9mF4swUoFj/exec';
const LS_SYNC='misgastos_sync_last';

// Parsea el monto que llega en una fila de la cola. Normalmente es un numero, pero
// si llega como TEXTO en formato chileno con coma decimal (ej. "23,8", que traen los
// montos USD), parseFloat lo cortaria en la coma y daria 23; por eso convertimos la
// coma a punto (y quitamos los puntos de miles) antes. Sin coma se parsea directo,
// asi los enteros nacionales (23800 / "23800") no se tocan.
function parseMontoCola(v){
  if(typeof v==='number') return v;
  const s=String(v).trim();
  return parseFloat(s.indexOf(',')>=0 ? s.replace(/\./g,'').replace(',','.') : s)||0;
}

async function syncFromSheets(){
  // Evitar sync si ya se hizo en los últimos 15 segundos
  const last=parseInt(localStorage.getItem(LS_SYNC)||'0');
  if(Date.now()-last < 15000) return;
  localStorage.setItem(LS_SYNC, Date.now().toString());
  try{
    const r=await fetch(APPS_SCRIPT_URL+'?action=getPending',{cache:'no-store'});
    if(!r.ok){console.warn('syncFromSheets HTTP error:',r.status);return;}
    const text=await r.text();
    console.log('syncFromSheets raw response:',text.substring(0,200));
    let data;
    try{data=JSON.parse(text);}catch(pe){console.warn('syncFromSheets JSON parse error:',pe,text);return;}
    if(!data.rows||!data.rows.length){console.log('syncFromSheets: no pending rows');return;}
    const pendingSplits=[];
    let imported=0;
    const toasts=[];
    for(const row of data.rows){
      const[txId,bank,type,amount,desc,cuotas,currency,date]=row;
      if(!txId||!amount) continue;
      const existing=[...getC(),...getD()].find(t=>t.id===txId);
      if(existing) continue;
      // Respeta la moneda que envia la cola (compras internacionales = USD). Antes
      // se forzaba 'CLP', por lo que los cobros en dolares (ej. Anthropic, OpenAI)
      // quedaban con moneda y magnitud equivocadas. Default CLP para filas sin
      // moneda (compatibilidad con la cola actual).
      const cur=String(currency||'').toUpperCase()==='USD'?'USD':'CLP';
      const amt=parseMontoCola(amount);
      if(type==='debito'){
        const d=getD();
        d.push({id:txId,bank,amount:amt,desc,currency:cur,
          date:(date?new Date(date):new Date()).toISOString(),source:'email_auto',catId:autoCategorize(desc)||''});
        saveD(d);
        pendingSplits.push({txId,amount:amt,desc,cuotas:1,currency:cur,cardId:bank,type:'debito'});
      } else {
        const d=getC();
        d.push({id:txId,cardId:bank,amount:amt,desc,cuotas:parseInt(cuotas)||1,currency:cur,
          date:(date?new Date(date):new Date()).toISOString(),source:'email_auto',catId:autoCategorize(desc)||''});
        saveC(d);
        pendingSplits.push({txId,amount:amt,desc,cuotas:parseInt(cuotas)||1,currency:cur,cardId:bank,type:'credito'});
      }
      imported++;
      toasts.push({msg:desc+' — '+(cur==='USD'?fmtUSD(amt):fmtCLP(amt)),type});
    }
    if(imported>0){
      renderDashboard(); renderDebito();
      toasts.forEach((t,i)=>{
        setTimeout(()=>showToast('📩 '+t.msg),i*1200);
      });
      // Marcar como procesados
      await fetch(APPS_SCRIPT_URL+'?action=markDone',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids:data.rows.map(r=>r[0])})
      }).catch(()=>{});
      // Abrir split modals después de todos los toasts
      if(pendingSplits.length>0){
        const delay=toasts.length*1200+600;
        setTimeout(()=>{
          _splitQueue=[...pendingSplits];
          _splitImportMode=false;
          processSplitQueue();
        }, delay);
      }
    }
  }catch(e){
    console.warn('syncFromSheets error:',e);
  }
}

function handleURLParams(){
  const p=new URLSearchParams(window.location.search);
  if(!p.has('amount')) return;
  const amount=parseFloat(p.get('amount')||0);
  // p.get() YA decodifica (el decodeURIComponent extra corrompia descs con '%').
  // La URL es una entrada REMOTA (cualquiera puede armar un link a la app):
  // se sanea aqui (largo acotado, sin caracteres de control) y ademas todo
  // desc se escapa al renderizar (esc en txHTML), asi nunca se interpreta HTML.
  const desc=String(p.get('desc')||'Gasto automático').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,120)||'Gasto automático';
  const type=p.get('type')==='debito'?'debito':'credito';
  const bank=CARDS[p.get('bank')]?p.get('bank'):'bci';
  const cuotas=Math.min(48,Math.max(1,parseInt(p.get('cuotas')||1)||1));
  const currency=p.get('currency')==='USD'?'USD':'CLP';
  const rawDate=p.get('date');
  const date=rawDate?parseFecha(rawDate):new Date();
  if(!amount||amount<=0) return;
  if(type==='debito'){
    const tx={id:Date.now().toString(),bank,amount,desc,currency,
      date:(date||new Date()).toISOString(),source:'shortcut'};
    const d=getD(); d.push(tx); saveD(d);
  } else {
    const tx={id:Date.now().toString(),cardId:bank,amount,desc,cuotas,currency,
      date:(date||new Date()).toISOString(),source:'shortcut'};
    const d=getC(); d.push(tx); saveC(d);
  }
  window.history.replaceState({},'',window.location.pathname);
  setTimeout(()=>showToast('✅ '+desc+' registrado'),600);
}

// ── Análisis de Gastos ────────────────────────────────────────────────────
let _analisisPeriod='ciclo';
let _analisisTxType='ambos';
let _analisisCatDetalle=null; // catId cuyo detalle se esta viendo, o null = resumen
let _analisisInformeSetup=false; // true = mostrando el selector de rango de meses del informe
let _analisisComparativo=false; // true = mostrando el comparativo mensual (barras mes a mes)
let _informeDesde=null, _informeHasta=null; // claves 'YYYY-MM'

function openAnalisisModal(){
  _analisisCatDetalle=null;
  _analisisInformeSetup=false;
  _analisisComparativo=false;
  renderAnalisis();
  document.getElementById('analisis-overlay').classList.add('open');
}
function closeAnalisisModal(){
  document.getElementById('analisis-overlay').classList.remove('open');
}
function closeAnalisisOutside(e){
  if(e.target===document.getElementById('analisis-overlay')) closeAnalisisModal();
}
function setAnalisisPeriod(p){_analisisPeriod=p;renderAnalisis();}
function setAnalisisTxType(t){_analisisTxType=t;renderAnalisis();}

// Modo del analisis (aplica a resumen, detalle, comparativo e informe PDF):
// 'cuotas'  -> lo que se PAGA en el periodo: cuotas mensuales con arrastre
// 'compras' -> lo que se COMPRO en el periodo: por fecha de compra y monto total
let _analisisModo='cuotas';
function setAnalisisModo(m){ _analisisModo=m; renderAnalisis(); }
// Fuente de credito segun el modo elegido (debito siempre va por su fecha)
function analisisCreditoTxs(){
  if(_analisisModo==='compras')
    return getC().filter(t=>!esPrestada(t)).map(t=>({...t,_tipo:'credito',_monto:aCLP(t.amount,t.currency)}));
  return cuotasMensuales();
}

// Expande las compras de credito en sus cuotas mensuales (arrastre a nivel de mes):
// una compra en N cuotas aporta amount/N a su mes de compra (corrido por cycleOffset
// si fue aplazada) y a los N-1 meses siguientes, conservando el dia de la compra.
// Es la version por mes calendario de cuotasActivasCiclo (que trabaja por ciclo de
// facturacion); Analisis, Comparativo e Informe agrupan por mes, por eso esta variante.
// Cada cuota sale con date = fecha nominal de esa cuota y _monto = cuota mensual.
function cuotasMensuales(){
  const out=[];
  getC().filter(t=>!esPrestada(t)).forEach(t=>{
    const n=Math.max(1,t.cuotas||1);
    const d=new Date(t.date);
    const cuotaAmt=aCLP(t.amount,t.currency)/n;
    for(let k=0;k<n;k++){
      const m=d.getMonth()+(t.cycleOffset||0)+k;
      const ultDia=new Date(d.getFullYear(),m+1,0).getDate();
      const f=new Date(d.getFullYear(),m,Math.min(d.getDate(),ultDia),12,0,0);
      out.push({...t,date:f.toISOString(),_tipo:'credito',_monto:cuotaAmt,_cuotaNum:k+1,_cuotaTotal:n});
    }
  });
  return out;
}
// Fin del mes actual: las cuotas de meses futuros no se muestran en los analisis
function _finMesActual(){ const h=new Date(); return new Date(h.getFullYear(),h.getMonth()+1,0,23,59,59); }

// Transacciones del analisis en un rango (credito segun _analisisModo + debito
// por su fecha, sin prestadas), cada una con _tipo y _monto ya calculados.
// dateStart null = "Todo": el credito se capea a fin del mes actual (sin cuotas
// futuras). Fuente unica de renderAnalisis y generarInformePDF: el bug de julio
// (informe sin cuotas) nacio de tener esta logica duplicada y divergente.
function analisisTxsPeriodo(dateStart,dateEnd){
  let txs=[];
  if(_analisisTxType!=='debito'){
    let c=analisisCreditoTxs();
    if(dateStart) c=c.filter(t=>{const d=new Date(t.date);return d>=dateStart&&d<=dateEnd;});
    else c=c.filter(t=>new Date(t.date)<=_finMesActual());
    txs=txs.concat(c);
  }
  if(_analisisTxType!=='credito'){
    let d=getD().filter(t=>!esPrestada(t));
    if(dateStart) d=d.filter(t=>{const dt=new Date(t.date);return dt>=dateStart&&dt<=dateEnd;});
    txs=txs.concat(d.map(t=>({...t,_tipo:'debito',_monto:t.amount||0})));
  }
  return txs;
}

// Agrupa transacciones (con _monto) por categoria. Devuelve {catMap, catData,
// grandTotal}: catData son las categorias con total>0 ordenadas de mayor a menor,
// cada una con items[] para el detalle y el informe. Fuente unica del resumen
// de Analisis y del PDF, para que ambos siempre cuadren.
function agruparPorCategoria(txs){
  const catMap={};
  getCategorias().forEach(c=>{catMap[c.id]={...c,total:0,count:0,items:[]};});
  catMap['']={id:'',name:'Sin categoría',emoji:'❓',color:'#555',total:0,count:0,items:[]};
  txs.forEach(t=>{
    const cid=t.catId||'';
    if(!catMap[cid]) catMap[cid]={id:cid,name:'Sin categoría',emoji:'❓',color:'#555',total:0,count:0,items:[]};
    catMap[cid].total+=t._monto; catMap[cid].count++; catMap[cid].items.push(t);
  });
  const catData=Object.values(catMap).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  return {catMap, catData, grandTotal:catData.reduce((s,c)=>s+c.total,0)};
}

function renderAnalisis(){
  // Selector de modo: cuotas pagadas en el periodo vs compras realizadas en el
  const modos=[
    {id:'cuotas',label:'💳 Cuotas del período'},
    {id:'compras',label:'🛒 Compras realizadas'},
  ];
  document.getElementById('analisis-modo-switch').innerHTML=
    `<div style="display:flex;background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:3px">`
    +modos.map(m=>`<button onclick="setAnalisisModo('${m.id}')" style="flex:1;padding:8px 4px;border-radius:9px;border:none;background:${_analisisModo===m.id?'var(--accent2)':'transparent'};color:${_analisisModo===m.id?'#fff':'var(--text2)'};font-size:12.5px;font-weight:600;cursor:pointer">${m.label}</button>`).join('')
    +`</div>
    <div style="font-size:11px;color:var(--text2);margin-top:6px">${_analisisModo==='cuotas'
      ?'Lo que pagas en el período: incluye las cuotas de compras de meses anteriores.'
      :'Lo que compraste en el período, por su monto total (aunque sea en cuotas).'}</div>`;

  // Period filters
  const periods=[
    {id:'ciclo',label:'Este ciclo'},
    {id:'mes',label:'Este mes'},
    {id:'mes-ant',label:'Mes anterior'},
    {id:'todo',label:'Todo'},
  ];
  document.getElementById('analisis-period-filters').innerHTML=periods.map(p=>
    `<button onclick="setAnalisisPeriod('${p.id}')" style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:1px solid ${_analisisPeriod===p.id?'var(--accent2)':'var(--border)'};background:${_analisisPeriod===p.id?'var(--accent2)':'transparent'};color:${_analisisPeriod===p.id?'#fff':'var(--text2)'};font-size:13px;cursor:pointer">${p.label}</button>`
  ).join('');

  // Type filters
  const types=[
    {id:'ambos',label:'Todos'},
    {id:'credito',label:'Crédito'},
    {id:'debito',label:'Débito'},
  ];
  document.getElementById('analisis-type-filters').innerHTML=`<div style="display:flex;gap:8px">`+types.map(t=>
    `<button onclick="setAnalisisTxType('${t.id}')" style="flex:1;padding:7px;border-radius:10px;border:1px solid ${_analisisTxType===t.id?'var(--accent2)':'var(--border)'};background:${_analisisTxType===t.id?'var(--accent2)':'transparent'};color:${_analisisTxType===t.id?'#fff':'var(--text2)'};font-size:13px;cursor:pointer">${t.label}</button>`
  ).join('')+'</div>'
  +`<div style="display:flex;justify-content:space-between;margin-top:10px">
      <button onclick="openComparativoMensual()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0">📊 Comparativo mensual →</button>
      <button onclick="openInformeSetup()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0">📄 Generar informe (PDF) →</button>
    </div>`;

  // Si se esta eligiendo el rango del informe, mostrar ese selector (independiente del período de arriba)
  if(_analisisInformeSetup){ renderInformeSetup(); return; }
  if(_analisisComparativo){ renderComparativoMensual(); return; }

  // Get date range ('todo' => null) y transacciones del período según modo y tipo
  const rango=rangoPeriodo(_analisisPeriod);
  const txs=analisisTxsPeriodo(rango?rango.start:null, rango?rango.end:null);

  if(!txs.length){
    document.getElementById('analisis-content').innerHTML='<div style="text-align:center;padding:40px 0;color:var(--text2)"><div style="font-size:40px">📭</div><p style="margin-top:8px">Sin gastos en este período</p></div>';
    return;
  }

  // Group by category (fuente unica compartida con el informe PDF)
  const {catMap,catData,grandTotal}=agruparPorCategoria(txs);

  // Si se seleccionó una categoría, mostrar su detalle (lista de gastos) en vez del resumen
  if(_analisisCatDetalle!==null){
    const cat=catMap[_analisisCatDetalle]||{id:_analisisCatDetalle,name:'Sin categoría',emoji:'❓',color:'#555'};
    const itemsInCat=txs.filter(t=>(t.catId||'')===_analisisCatDetalle);
    renderAnalisisCatDetalle(cat,itemsInCat);
    return;
  }

  // Draw pie chart SVG
  const size=220,cx=110,cy=110,r=85,ri=45;
  let startAngle=-Math.PI/2;
  let slices='';
  catData.forEach(c=>{
    const angle=(c.total/grandTotal)*2*Math.PI;
    const endAngle=startAngle+angle;
    const x1=cx+r*Math.cos(startAngle),y1=cy+r*Math.sin(startAngle);
    const x2=cx+r*Math.cos(endAngle),y2=cy+r*Math.sin(endAngle);
    const xi1=cx+ri*Math.cos(startAngle),yi1=cy+ri*Math.sin(startAngle);
    const xi2=cx+ri*Math.cos(endAngle),yi2=cy+ri*Math.sin(endAngle);
    const large=angle>Math.PI?1:0;
    slices+=`<path d="M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${ri},${ri} 0 ${large} 0 ${xi1},${yi1}" fill="${esc(c.color)}" opacity="0.9"/>`;
    startAngle=endAngle;
  });
  const pieChart=`<svg viewBox="0 0 ${size} ${size}" style="width:180px;height:180px;display:block;margin:0 auto 16px">
    ${slices}
    <circle cx="${cx}" cy="${cy}" r="${ri-2}" fill="var(--bg)"/>
    <text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="600">Total</text>
    <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="var(--accent2)" font-size="12" font-weight="700">${fmtCLP(grandTotal)}</text>
  </svg>`;

  // Category breakdown
  const breakdown=catData.map(c=>{
    const pct=((c.total/grandTotal)*100).toFixed(1);
    const barW=Math.round((c.total/grandTotal)*100);
    return `<div onclick="openAnalisisCatDetalle('${escJsAttr(c.id)}')" style="margin-bottom:14px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:13px;font-weight:600">${esc(c.emoji)} ${esc(c.name)}</span>
        <span style="font-size:13px;font-weight:700;color:var(--accent2)">${fmtCLP(c.total)}</span>
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden">
        <div style="background:${esc(c.color)};height:100%;width:${barW}%;border-radius:4px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px;display:flex;justify-content:space-between">
        <span>${pct}% · ${c.count} cargo${c.count!==1?'s':''}</span>
        <span style="color:var(--accent2)">Ver detalle →</span>
      </div>
    </div>`;
  }).join('');

  document.getElementById('analisis-content').innerHTML=pieChart+breakdown;
}

// Muestra la lista de gastos que componen una categoria (dentro del mismo modal).
// Reutiliza txHTML (la misma fila que Historial/Debito) para consistencia visual.
function openAnalisisCatDetalle(catId){
  _analisisCatDetalle=catId;
  renderAnalisis();
}
function closeAnalisisCatDetalle(){
  _analisisCatDetalle=null;
  renderAnalisis();
}
function renderAnalisisCatDetalle(cat,itemsInCat){
  const sorted=[...itemsInCat].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total=itemsInCat.reduce((s,t)=>s+t._monto,0);
  const rowsHTML=sorted.length?sorted.map(txHTML).join('')
    :'<div class="empty" style="padding:30px 0"><p style="color:var(--text2);font-size:13px">Sin gastos en esta categoría</p></div>';
  document.getElementById('analisis-content').innerHTML=`
    <button onclick="closeAnalisisCatDetalle()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0;margin-bottom:14px">← Volver al resumen</button>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <span style="font-size:22px">${esc(cat.emoji)}</span>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">${esc(cat.name)}</div>
        <div style="font-size:12px;color:var(--text2)">${itemsInCat.length} cargo${itemsInCat.length!==1?'s':''}</div>
      </div>
      <div style="font-size:18px;font-weight:700;color:var(--accent2)">${fmtCLP(total)}</div>
    </div>
    <div class="tx-list" style="padding:0">${rowsHTML}</div>`;
}

// ── Comparativo mensual (barras mes a mes, dentro de "Ver análisis") ───────
// Agrupa con el mismo criterio (y modo) del modal de Analisis: credito por
// cuota mensual con arrastre o por compra total segun _analisisModo, debito
// por su fecha. Los meses futuros no se incluyen.
function comparativoMensualData(){
  const map={};
  const hoy=new Date();
  const capKey=hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0');
  const key=t=>{ const d=new Date(t.date); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  if(_analisisTxType!=='debito'){
    analisisCreditoTxs().forEach(t=>{
      const k=key(t); if(k>capKey) return; // sin meses futuros
      if(!map[k]) map[k]={key:k,cred:0,deb:0};
      map[k].cred+=t._monto;
    });
  }
  if(_analisisTxType!=='credito'){
    getD().filter(t=>!esPrestada(t)).forEach(t=>{
      const k=key(t); if(!map[k]) map[k]={key:k,cred:0,deb:0};
      map[k].deb+=t.amount||0;
    });
  }
  return Object.values(map).map(m=>({...m,total:m.cred+m.deb}))
    .filter(m=>m.total>0)
    .sort((a,b)=>a.key<b.key?-1:1)
    .slice(-12); // maximo los ultimos 12 meses con datos
}
// $1.234.567 -> "$1,2M" / $45.600 -> "$46k" (para etiquetas compactas del grafico)
function fmtCorto(n){
  if(n>=1000000) return '$'+(n/1000000).toFixed(1).replace('.',',').replace(',0','')+'M';
  if(n>=1000) return '$'+Math.round(n/1000)+'k';
  return '$'+Math.round(n);
}
function openComparativoMensual(){
  _analisisCatDetalle=null;
  _analisisInformeSetup=false;
  _analisisComparativo=true;
  renderAnalisis();
}
function closeComparativoMensual(){
  _analisisComparativo=false;
  renderAnalisis();
}
function renderComparativoMensual(){
  const data=comparativoMensualData();
  const cont=document.getElementById('analisis-content');
  const volver=`<button onclick="closeComparativoMensual()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0;margin-bottom:14px">← Volver al resumen</button>`;
  if(!data.length){
    cont.innerHTML=volver+'<div style="text-align:center;padding:30px 0;color:var(--text2)"><div style="font-size:40px">📊</div><p style="margin-top:8px;font-size:13px">Sin datos para comparar</p></div>';
    return;
  }
  const maxTot=Math.max(...data.map(m=>m.total));
  // Grafico SVG de barras apiladas (credito rojo + debito azul), etiqueta de total arriba
  const bw=34, gap=14, chH=150, padT=24, padB=30;
  const chW=data.length*(bw+gap)+gap;
  const mesCorto=k=>{ const [y,m]=k.split('-').map(Number); return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m-1]; };
  let bars='';
  data.forEach((m,i)=>{
    const x=gap+i*(bw+gap);
    const hTot=maxTot>0?(m.total/maxTot)*chH:0;
    const hCred=maxTot>0?(m.cred/maxTot)*chH:0;
    const yTop=padT+(chH-hTot);
    // debito abajo (azul), credito arriba (rojo)
    const hDeb=hTot-hCred;
    if(hDeb>0) bars+=`<rect x="${x}" y="${padT+chH-hDeb}" width="${bw}" height="${hDeb}" rx="3" fill="#38bdf8" opacity="0.9"/>`;
    if(hCred>0) bars+=`<rect x="${x}" y="${yTop}" width="${bw}" height="${hCred}" rx="3" fill="#f87171" opacity="0.9"/>`;
    bars+=`<text x="${x+bw/2}" y="${yTop-6}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="700">${fmtCorto(m.total)}</text>`;
    bars+=`<text x="${x+bw/2}" y="${padT+chH+16}" text-anchor="middle" fill="var(--text2)" font-size="9">${mesCorto(m.key)}</text>`;
  });
  const chart=`<div style="overflow-x:auto;margin-bottom:6px"><svg viewBox="0 0 ${chW} ${padT+chH+padB}" style="min-width:${Math.min(chW,440)}px;width:${chW}px;height:${padT+chH+padB}px;display:block;margin:0 auto">${bars}</svg></div>`;
  const legend=`<div style="display:flex;gap:16px;justify-content:center;margin-bottom:14px">
    <span style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:3px;background:#f87171;display:inline-block"></span>Crédito</span>
    <span style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:3px;background:#38bdf8;display:inline-block"></span>Débito</span>
  </div>`;
  const prom=data.reduce((s,m)=>s+m.total,0)/data.length;
  const filas=data.slice().reverse().map(m=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:600">${mesLabel(m.key)}</div>
        <div style="font-size:11px;color:var(--text2)">Crédito ${fmtCLP(m.cred)} · Débito ${fmtCLP(m.deb)}</div>
      </div>
      <span style="font-size:14px;font-weight:700;color:${m.total>prom?'var(--red)':'var(--green)'}">${fmtCLP(m.total)}</span>
    </div>`).join('');
  cont.innerHTML=volver+
    `<div style="font-size:12px;color:var(--text2);margin-bottom:14px">${_analisisModo==='cuotas'?'Pago mensual':'Compras por mes'} (últimos ${data.length} mes${data.length!==1?'es':''} con datos). Promedio: <strong style="color:var(--text)">${fmtCLP(prom)}</strong> — en la lista, <span style="color:var(--red)">rojo</span> = sobre el promedio, <span style="color:var(--green)">verde</span> = bajo.</div>`
    +chart+legend+filas;
}

// ── Informe de gastos en PDF (rango de meses elegido por el usuario) ───────
const _MESES_NOMBRE=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function mesLabel(key){ const [y,m]=key.split('-').map(Number); return _MESES_NOMBRE[m-1]+' '+y; }
// Meses (claves 'YYYY-MM') que tienen al menos un cargo, segun el filtro de tipo
// y el modo actual (cuotas con arrastre o compras por fecha). Sin meses futuros.
function mesesDisponibles(){
  const set=new Set();
  const hoy=new Date();
  const capKey=hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0');
  const add=t=>{ const d=new Date(t.date); const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(k<=capKey) set.add(k); };
  if(_analisisTxType!=='debito') analisisCreditoTxs().forEach(add);
  if(_analisisTxType!=='credito') getD().filter(t=>!esPrestada(t)).forEach(add);
  return [...set].sort();
}
function openInformeSetup(){
  _analisisCatDetalle=null;
  _analisisComparativo=false;
  _analisisInformeSetup=true;
  const meses=mesesDisponibles();
  if(meses.length){
    if(!_informeDesde||!meses.includes(_informeDesde)) _informeDesde=meses[0];
    if(!_informeHasta||!meses.includes(_informeHasta)) _informeHasta=meses[meses.length-1];
  }
  renderAnalisis();
}
function closeInformeSetup(){
  _analisisInformeSetup=false;
  renderAnalisis();
}
function setInformeDesde(v){ _informeDesde=v; }
function setInformeHasta(v){ _informeHasta=v; }
function renderInformeSetup(){
  const meses=mesesDisponibles();
  if(!meses.length){
    document.getElementById('analisis-content').innerHTML=`
      <button onclick="closeInformeSetup()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0;margin-bottom:14px">← Volver</button>
      <div style="text-align:center;padding:30px 0;color:var(--text2)"><p style="font-size:13px">No hay gastos registrados para generar un informe.</p></div>`;
    return;
  }
  const optsDesde=meses.map(k=>`<option value="${k}" ${k===_informeDesde?'selected':''}>${mesLabel(k)}</option>`).join('');
  const optsHasta=meses.map(k=>`<option value="${k}" ${k===_informeHasta?'selected':''}>${mesLabel(k)}</option>`).join('');
  const tipoLabel=_analisisTxType==='ambos'?'Todos':_analisisTxType==='credito'?'Crédito':'Débito';
  const modoLbl=_analisisModo==='cuotas'?'Cuotas del período':'Compras realizadas';
  document.getElementById('analisis-content').innerHTML=`
    <button onclick="closeInformeSetup()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0;margin-bottom:14px">← Volver</button>
    <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">📄 Generar informe</h3>
    <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Elige el rango de meses a incluir (filtro: ${tipoLabel} · modo: ${modoLbl}).</p>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:5px">Desde</label>
      <select onchange="setInformeDesde(this.value)" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:14px">${optsDesde}</select>
    </div>
    <div style="margin-bottom:20px">
      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:5px">Hasta</label>
      <select onchange="setInformeHasta(this.value)" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:14px">${optsHasta}</select>
    </div>
    <button onclick="generarInformePDF()" class="btn-save" style="width:100%">Generar PDF</button>`;
}
async function generarInformePDF(){
  if(!_informeDesde||!_informeHasta) return;
  const [d1,d2]=[_informeDesde,_informeHasta].sort(); // 'YYYY-MM' ordena bien como string
  const [y1,m1]=d1.split('-').map(Number), [y2,m2]=d2.split('-').map(Number);
  const dateStart=new Date(y1,m1-1,1,0,0,0);
  const dateEnd=new Date(y2,m2,0,23,59,59); // ultimo dia del mes "hasta"
  const nMesesRango=(y2*12+m2)-(y1*12+m1)+1;

  // Misma fuente que el modal de Analisis (analisisTxsPeriodo + agruparPorCategoria):
  // el informe SIEMPRE cuadra con lo que se ve en pantalla.
  const txs=analisisTxsPeriodo(dateStart,dateEnd);
  if(!txs.length){ showToast('No hay gastos en ese rango de meses','var(--yellow)'); return; }
  const {catData,grandTotal}=agruparPorCategoria(txs);
  const totCred=txs.filter(t=>t._tipo==='credito').reduce((s,t)=>s+t._monto,0);
  const totDeb=txs.filter(t=>t._tipo==='debito').reduce((s,t)=>s+t._monto,0);
  const rangoLabel=d1===d2?mesLabel(d1):(mesLabel(d1)+' - '+mesLabel(d2));
  const tipoLabel=_analisisTxType==='ambos'?'Crédito y débito':_analisisTxType==='credito'?'Solo crédito':'Solo débito';
  const modoLabel=_analisisModo==='cuotas'?'Cuotas del período':'Compras realizadas';
  const pctTxt=v=>v.toFixed(1).replace('.',',')+'%';

  const fmtFechaPdf=d=>new Date(d).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'});
  const origenPdf=t=>t._tipo==='debito'?('Débito '+(CARDS[t.bank]?CARDS[t.bank].bank:'')).trim():(CARDS[t.cardId]?CARDS[t.cardId].bank:'Crédito');

  const resumenBloque={
    titulo:'Resumen del período',
    subtitulo:txs.length+' cargo'+(txs.length!==1?'s':''),
    rows:[
      {desc:_analisisModo==='cuotas'?'Gasto en crédito (cuotas del período)':'Compras en crédito (monto total)',monto:fmtCLP(totCred),pct:grandTotal>0?pctTxt(totCred/grandTotal*100):''},
      {desc:'Gasto en débito',monto:fmtCLP(totDeb),pct:grandTotal>0?pctTxt(totDeb/grandTotal*100):''}
    ].concat(nMesesRango>1?[{desc:'Promedio mensual ('+nMesesRango+' meses)',monto:fmtCLP(grandTotal/nMesesRango)}]:[]),
    total:{label:'Total gastado',value:fmtCLP(grandTotal)}
  };

  // Balance vs ingreso: cuanto entro (sueldo x meses) vs cuanto se gasto = ahorro
  const sueldo=getSueldo();
  const ingresoTotal=sueldo*nMesesRango;
  const ahorro=ingresoTotal-grandTotal;
  const balanceBloque=sueldo>0?{
    titulo:'Balance del período',
    subtitulo:'ingreso mensual: '+fmtCLP(sueldo),
    rows:[
      {desc:'Ingresos ('+nMesesRango+' mes'+(nMesesRango!==1?'es':'')+')',monto:fmtCLP(ingresoTotal)},
      {desc:'Total gastado',monto:fmtCLP(grandTotal),pct:ingresoTotal>0?pctTxt(grandTotal/ingresoTotal*100):''}
    ],
    total:{label:ahorro>=0?'Ahorro estimado':'Déficit del período',value:fmtCLP(ahorro),color:ahorro>=0?'green':'red'}
  }:null;

  // Comparativo mensual dentro del PDF (solo si el rango cubre 2+ meses)
  let compBloque=null;
  const porMes={};
  txs.forEach(t=>{
    const d=new Date(t.date);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!porMes[k]) porMes[k]={key:k,cred:0,deb:0};
    if(t._tipo==='credito') porMes[k].cred+=t._monto; else porMes[k].deb+=t._monto;
  });
  const mesesData=Object.values(porMes).map(m=>({...m,total:m.cred+m.deb})).sort((a,b)=>a.key<b.key?-1:1);
  if(mesesData.length>=2){
    compBloque={
      titulo:'Comparativo mensual',
      subtitulo:'% = participación en el total del período',
      rows:mesesData.map(m=>({
        desc:mesLabel(m.key),
        sub:'Crédito '+fmtCLP(m.cred)+' · Débito '+fmtCLP(m.deb),
        monto:fmtCLP(m.total),
        pct:grandTotal>0?pctTxt(m.total/grandTotal*100):''
      })),
      total:{label:'Promedio mensual',value:fmtCLP(grandTotal/mesesData.length)}
    };
  }

  // Con valor del dolar, los USD ya vienen convertidos en _monto y suman al total,
  // asi que el informe muestra el peso convertido; sin valor, el USD va aparte.
  const vdPdf=getValorDolar();
  const catBloques=catData.map(c=>({
    titulo:c.name,
    subtitulo:pctTxt((c.total/grandTotal)*100)+' del total · '+c.count+' cargo'+(c.count!==1?'s':''),
    rows:[...c.items].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(t=>({
      col1:fmtFechaPdf(t.date),
      desc:t.desc||'Sin descripción',
      sub:origenPdf(t)
        +(t._cuotaTotal>1?' · cuota '+t._cuotaNum+'/'+t._cuotaTotal:'')
        +(!t._cuotaTotal&&t._tipo==='credito'&&t.cuotas>1?' · '+t.cuotas+' cuotas'+(t.currency==='CLP'?' de '+fmtCLP(t.amount/t.cuotas):''):'')
        +(t.currency==='USD'?(vdPdf>0?' · '+fmtUSD(t.amount/Math.max(1,t._cuotaTotal||1))+' convertido a CLP':' · en dólares (no suma al total CLP)'):''),
      monto:t.currency==='USD'?(vdPdf>0?fmtCLP(t._monto):fmtUSD(t.amount/Math.max(1,t._cuotaTotal||1))):fmtCLP(t._monto)
    })),
    total:{label:'Subtotal',value:fmtCLP(c.total)}
  }));

  closeInformeSetup(); // vuelve al resumen mientras se genera/comparte el PDF
  const bloques=[resumenBloque].concat(balanceBloque?[balanceBloque]:[]).concat(compBloque?[compBloque]:[]).concat(catBloques);
  await compartirPDF('informe_gastos_'+d1+'_a_'+d2+'.pdf', 'Informe de gastos - '+rangoLabel, bloques,
    {estilo:'ejecutivo',tituloPrincipal:'Informe de gastos',subtitulo:rangoLabel+' · '+tipoLabel+' · '+modoLabel});
}

// ── ¿Qué debo? — desglose de compras por pagar ────────────────────────────
// Vista de SOLO LECTURA. Las compras en cuotas se "arrastran": cada cuota
// mensual aparece en el ciclo que corresponde (cuota 1, 2, 3...). Usa la misma
// fuente (cuotasActivasCiclo) que el dashboard, Tarjetas y el recordatorio, asi
// que el total de credito cuadra con esas vistas.
let _queDeboPeriod='cerrado'; // 'cerrado' = ciclo que ya cerro (a pagar) | 'actual' = ciclo en curso

// Indice monotonico del ciclo de facturacion al que pertenece una fecha, segun el
// dia de cierre. Coincide con como getCycle asigna las fechas a ciclos.
function queDeboCycleIndex(date, cutDay){
  const d=new Date(date);
  let m=d.getMonth();
  if(d.getDate()>cutDay) m+=1; // si es despues del cierre, cae en el ciclo del mes siguiente
  return d.getFullYear()*12 + m;
}

function openQueDeboModal(){
  renderQueDebo();
  document.getElementById('quedebo-overlay').classList.add('open');
}
function closeQueDeboModal(){
  document.getElementById('quedebo-overlay').classList.remove('open');
}
function closeQueDeboOutside(e){
  if(e.target===document.getElementById('quedebo-overlay')) closeQueDeboModal();
}
function setQueDeboPeriod(p){ _queDeboPeriod=p; renderQueDebo(); }

function renderQueDebo(){
  const period=_queDeboPeriod;
  const tabs=[
    {id:'cerrado',label:'Por pagar (ciclo cerrado)'},
    {id:'actual',label:'Ciclo actual (en curso)'}
  ];
  document.getElementById('quedebo-tabs').innerHTML=tabs.map(t=>
    `<button onclick="setQueDeboPeriod('${t.id}')" style="flex:1;padding:9px;border-radius:10px;border:1px solid ${period===t.id?'var(--accent2)':'var(--border)'};background:${period===t.id?'var(--accent2)':'transparent'};color:${period===t.id?'#fff':'var(--text2)'};font-size:12px;font-weight:600;cursor:pointer">${t.label}</button>`
  ).join('');

  // Recolecta las cuotas que caen en el ciclo elegido, usando la misma fuente
  // (cuotasActivasCiclo) que el dashboard, Tarjetas y el recordatorio de pago,
  // para que los totales siempre cuadren entre todas las vistas.
  const offset = period==='cerrado' ? -1 : 0;
  let items=[];
  Object.values(CARDS).forEach(c=>{
    cuotasActivasCiclo(c.id, offset).forEach(x=>items.push({tx:x.tx, card:c, cuotaNum:x.cuotaNum, cuotasTotal:x.cuotasTotal}));
  });
  items.sort((a,b)=>new Date(b.tx.date)-new Date(a.tx.date));

  let totalCLP=0, totalUSD=0;
  items.forEach(({tx,cuotasTotal})=>{
    const cuota=tx.amount/cuotasTotal;
    if(tx.currency==='USD') totalUSD+=cuota; else totalCLP+=cuota;
  });

  const ref = period==='cerrado' ? getPrevCycle('bci') : getCycle('bci');
  const rango = ref.start.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})+' – '+ref.end.toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
  const explica = period==='cerrado'
    ? 'Cuotas que te toca pagar del ciclo que ya cerró (incluye arrastres de compras en cuotas).'
    : 'Cuotas que pagarás en el ciclo en curso (incluye arrastres de compras en cuotas).';

  const cont=document.getElementById('quedebo-content');
  if(!items.length){
    cont.innerHTML=`<div style="text-align:center;padding:40px 0;color:var(--text2)"><div style="font-size:40px">${period==='cerrado'?'🎉':'🧾'}</div><p style="margin-top:8px">${period==='cerrado'?'No tienes nada por pagar de este ciclo':'Sin cuotas por pagar en el ciclo actual'}</p></div>`;
    return;
  }

  const vd=getValorDolar();
  const rows=items.map(({tx,card,cuotaNum,cuotasTotal})=>{
    const cuota=tx.amount/cuotasTotal;
    const esUSD=tx.currency==='USD';
    // USD: muestra el monto en dolares y, si hay valor definido, el estimado en pesos
    const montoCuota=esUSD?(fmtUSD(cuota)+(vd>0?` <span style="font-size:10px;color:var(--text2);font-weight:400">≈ ${fmtCLP(cuota*vd)}</span>`:'')):fmtCLP(cuota);
    const nCuotas=cuotasTotal>1?`cuota ${cuotaNum} de ${cuotasTotal}`:'Contado';
    const montoFull=cuotasTotal>1?` · total ${esUSD?fmtUSD(tx.amount):fmtCLP(tx.amount)}`:'';
    const fecha=new Date(tx.date).toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
    const off=tx.cycleOffset||0;
    return `<div style="padding:11px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:10px;height:10px;border-radius:50%;background:${card.color};flex-shrink:0" title="${card.bank}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tx.desc)||'Sin descripción'}${aplazadaTag(off)}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${card.bank} · ${fecha} · ${nCuotas}${montoFull}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:14px;font-weight:700">${montoCuota}</div>
          ${cuotasTotal>1?'<div style="font-size:10px;color:var(--text2)">por cuota</div>':''}
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;margin-left:20px">${aplazarControlHTML(tx.id, off)}</div>
    </div>`;
  }).join('');

  // Con valor del dolar: total en pesos con el USD ya convertido. Sin valor: como
  // antes (peso + el USD aparte, para no ocultarlo).
  const totalStr = vd>0
    ? fmtCLP(totalCLP+totalUSD*vd)
    : `${fmtCLP(totalCLP)}${totalUSD>0?' + '+fmtUSD(totalUSD):''}`;
  // En listas largas, mostrar el total tambien arriba para no tener que bajar hasta el final
  const topTotal = items.length>8
    ? `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:14px">
        <span style="font-size:13px;font-weight:600">Total a pagar</span>
        <span style="font-size:18px;font-weight:700;color:var(--accent2)">${totalStr}</span>
      </div>`
    : '';
  const bottomTotal=`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:2px solid var(--border)">
      <span style="font-size:14px;font-weight:600">Total a pagar</span>
      <span style="font-size:18px;font-weight:700;color:var(--accent2)">${totalStr}</span>
    </div>`;
  const nota=`<div style="font-size:11px;color:var(--text2);line-height:1.5;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-top:14px">ℹ️ Es lo que pagas de <strong style="color:var(--text)">crédito</strong> este ciclo, incluyendo las <strong style="color:var(--text)">cuotas que arrastras</strong> de compras de meses anteriores. Coincide con el chip "Crédito" del inicio (el <strong style="color:var(--text)">débito</strong> no se incluye porque ya se pagó desde tu cuenta corriente).</div>`;

  cont.innerHTML=`
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${explica}</div>
    <div style="font-size:12px;color:var(--accent2);margin-bottom:14px">📅 ${rango} · ${items.length} compra${items.length!==1?'s':''}</div>
    ${topTotal}
    ${rows}
    ${bottomTotal}
    ${nota}`;
}

// ── Conciliar cartola: match app vs estado de cuenta del banco ─────────────
// Flujo: elegir tarjeta + ciclo -> subir cartola (CSV/Excel) -> match por
// MONTO (tolerancia minima) con FECHA como desempate -> pantalla de revision
// -> confirmar (aplaza las no facturadas y registra las que faltan, si quieres).
let _conciliaCard='bci', _conciliaPeriod='cerrado', _conciliaData=null;

function openConciliaModal(){
  _conciliaData=null;
  renderConciliaSetup();
  document.getElementById('concilia-overlay').classList.add('open');
}
function closeConciliaModal(){ document.getElementById('concilia-overlay').classList.remove('open'); _conciliaData=null; }
function closeConciliaOutside(e){ if(e.target===document.getElementById('concilia-overlay')) closeConciliaModal(); }
function setConciliaCard(id){ _conciliaCard=id; renderConciliaSetup(); }
function setConciliaPeriod(p){ _conciliaPeriod=p; renderConciliaSetup(); }

function renderConciliaSetup(){
  const cards=Object.values(CARDS);
  const offset=_conciliaPeriod==='cerrado'?-1:0;
  const ref=offset===-1?getPrevCycle(_conciliaCard):getCycle(_conciliaCard);
  const rango=ref.start.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})+' – '+ref.end.toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
  const nEsperadas=conciliaEsperadas(_conciliaCard,offset).length;
  document.getElementById('concilia-content').innerHTML=`
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Compara lo que la app cree que te facturaron con la cartola real del banco. Las compras que no aparezcan podrás aplazarlas; las que falten, registrarlas.</div>
    <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Tarjeta</div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      ${cards.map(c=>`<button onclick="setConciliaCard('${c.id}')" style="flex:1;padding:8px;border-radius:10px;border:1px solid ${_conciliaCard===c.id?'var(--accent2)':'var(--border)'};background:${_conciliaCard===c.id?'var(--accent2)':'transparent'};color:${_conciliaCard===c.id?'#fff':'var(--text2)'};font-size:12px;font-weight:600;cursor:pointer">${c.bank}</button>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Ciclo a conciliar</div>
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <button onclick="setConciliaPeriod('cerrado')" style="flex:1;padding:8px;border-radius:10px;border:1px solid ${_conciliaPeriod==='cerrado'?'var(--accent2)':'var(--border)'};background:${_conciliaPeriod==='cerrado'?'var(--accent2)':'transparent'};color:${_conciliaPeriod==='cerrado'?'#fff':'var(--text2)'};font-size:12px;font-weight:600;cursor:pointer">Ciclo cerrado</button>
      <button onclick="setConciliaPeriod('actual')" style="flex:1;padding:8px;border-radius:10px;border:1px solid ${_conciliaPeriod==='actual'?'var(--accent2)':'var(--border)'};background:${_conciliaPeriod==='actual'?'var(--accent2)':'transparent'};color:${_conciliaPeriod==='actual'?'#fff':'var(--text2)'};font-size:12px;font-weight:600;cursor:pointer">Ciclo actual</button>
    </div>
    <div style="font-size:11px;color:var(--accent2);margin-bottom:14px">📅 ${rango} · la app espera ${nEsperadas} cargo${nEsperadas!==1?'s':''}</div>
    <div class="import-box" style="margin:0" onclick="document.getElementById('concilia-file').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <h4>Subir cartola o estado de cuenta</h4>
      <p>CSV, Excel (.xls / .xlsx) o PDF digital (ej. Scotia)</p>
      <input type="file" id="concilia-file" accept=".csv,.xlsx,.xls,.pdf" style="display:none" onchange="conciliaFile(event)" />
    </div>`;
}

// Cargos que la app ESPERA en la cartola de ese ciclo. A diferencia de
// cuotasActivasCiclo, incluye prestadas (el banco igual las cobra) y usa el
// monto que cobro el banco: en divididas/prestadas es el total (splitTotal).
function conciliaEsperadas(cardId, offset){
  const cutDay=getBillingDay(cardId);
  const targetIdx=queDeboCycleIndex(new Date(),cutDay)+(offset||0);
  const out=[];
  getC().forEach(t=>{
    if(t.cardId!==cardId || t.currency==='USD') return;
    const n=Math.max(1,t.cuotas||1);
    const base=queDeboCycleIndex(t.date,cutDay)+(t.cycleOffset||0);
    const k=targetIdx-base;
    if(k>=0&&k<n) out.push({tx:t, cuotaNum:k+1, cuotasTotal:n, bankAmt:(t.splitTotal||t.amount)/n});
  });
  return out;
}

// pdf.js (Mozilla) cargado bajo demanda, solo si el usuario sube un PDF.
let _pdfjsPromise=null;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve();
  if(!_pdfjsPromise){
    _pdfjsPromise=new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.integrity='sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';
      s.crossOrigin='anonymous'; s.referrerPolicy='no-referrer';
      s.onload=()=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(); };
      s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  return _pdfjsPromise;
}
// Extrae movimientos de un estado de cuenta PDF (texto digital, no escaneado).
// Heuristica: reconstruye lineas por posicion vertical y toma las que tengan
// FECHA + MONTO; el ultimo monto de la linea es el cargo facturado.
async function parsePdfCartola(buf, bank){
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const lineas=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const porY={};
    tc.items.forEach(it=>{
      const y=Math.round(it.transform[5]/2)*2; // agrupa items a la misma altura (+-2pt)
      (porY[y]=porY[y]||[]).push({x:it.transform[4],str:it.str});
    });
    Object.keys(porY).map(Number).sort((a,b)=>b-a).forEach(y=>{
      const linea=porY[y].sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(linea) lineas.push(linea);
    });
  }
  const res=[];
  lineas.forEach((linea,i)=>{
    const fm=linea.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if(!fm) return;
    const fecha=parseFecha(fm[0]);
    if(!fecha) return;
    let resto=linea.replace(fm[0],' ');
    // cuotas tipo "03/06" (despues de quitar la fecha)
    let cuotas=1;
    const qm=resto.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if(qm && parseInt(qm[2])>1 && parseInt(qm[2])<=48){ cuotas=parseInt(qm[2]); resto=resto.replace(qm[0],' '); }
    // montos: tokens numericos con miles (12.345) o $; el ULTIMO es el cargo
    const tokens=resto.match(/\$?\s*\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\$\s*\d+/g)||[];
    let amount=0;
    for(let k=tokens.length-1;k>=0;k--){ const v=parseMonto(tokens[k]); if(v>=100){ amount=v; break; } }
    if(!amount) return;
    let desc=resto;
    tokens.forEach(t=>{ desc=desc.replace(t,' '); });
    desc=desc.replace(/[^\wÁÉÍÓÚÑáéíóúñ.*\- ]/g,' ').replace(/\s+/g,' ').trim()||'Movimiento PDF';
    res.push({id:'pdf_'+Date.now()+'_'+i, bank, rawDesc:linea.slice(0,60), desc:desc.slice(0,40), cuotas, date:fecha.toISOString(), amount});
  });
  return res;
}

function conciliaFile(evt){
  const file=evt.target.files[0];
  if(!file) return;
  const name=file.name.toLowerCase();
  const isCSV=name.endsWith('.csv');
  const isPDF=name.endsWith('.pdf');
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      let parsed;
      if(isPDF){
        showToast('Leyendo PDF…');
        await loadPdfJs();
        parsed=await parsePdfCartola(new Uint8Array(e.target.result),_conciliaCard);
      } else {
        let rows;
        if(isCSV){ rows=parseCSV(e.target.result); }
        else{
          await loadXLSX();
          const wb=XLSX.read(e.target.result,{type:'array'});
          rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});
        }
        parsed=parseCartola(rows,_conciliaCard);
      }
      if(!parsed.length){ showToast(isPDF?'No se pudieron extraer movimientos del PDF (¿escaneado?)':'No se encontraron movimientos en el archivo','var(--yellow)'); return; }
      conciliaMatch(parsed);
    }catch(err){
      console.error('concilia:',err);
      const msg=String(err&&err.name==='PasswordException'?'El PDF tiene contraseña; guárdalo sin clave e intenta de nuevo':('Error al leer el archivo: '+(err.message||err)));
      showToast(msg,'var(--red)');
    }
  };
  if(isCSV) reader.readAsText(file,'UTF-8'); else reader.readAsArrayBuffer(file);
  evt.target.value='';
}

// Match: el monto debe calzar (tolerancia +-5 CLP, por redondeos de cuotas del
// banco) y entre candidatos con el mismo monto gana la fecha mas cercana.
function conciliaMatch(rows){
  const offset=_conciliaPeriod==='cerrado'?-1:0;
  const esperadas=conciliaEsperadas(_conciliaCard,offset);
  const used=new Array(rows.length).fill(false);
  const TOL=5;
  esperadas.forEach(e=>{
    let best=-1,bestDias=Infinity;
    rows.forEach((r,i)=>{
      if(used[i]) return;
      if(Math.abs(r.amount-e.bankAmt)>TOL) return;
      const dias=Math.abs(new Date(r.date)-new Date(e.tx.date))/86400000;
      if(dias<bestDias){ bestDias=dias; best=i; }
    });
    if(best>=0){ used[best]=true; e.match=rows[best]; }
  });
  _conciliaData={esperadas, extras:rows.filter((r,i)=>!used[i])};
  renderConciliaReview();
}

function renderConciliaReview(){
  const {esperadas,extras}=_conciliaData;
  const ok=esperadas.filter(e=>e.match);
  const sinFacturar=esperadas.filter(e=>!e.match);
  const fila=(inner)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">${inner}</div>`;
  const fmtF=d=>new Date(d).toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
  const sec=(titulo,color,cuerpo)=>`<div style="margin-bottom:18px"><div style="font-size:12px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${titulo}</div>${cuerpo}</div>`;

  const okHTML=ok.length?ok.map(e=>fila(`
    <span style="color:var(--green);flex-shrink:0">✅</span>
    <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.tx.desc)}</div>
    <div style="font-size:11px;color:var(--text2)">${fmtF(e.tx.date)}${e.cuotasTotal>1?' · cuota '+e.cuotaNum+'/'+e.cuotasTotal:''} · en cartola: "${esc((e.match.rawDesc||e.match.desc||'').slice(0,28))}"</div></div>
    <span style="font-size:13px;font-weight:700;flex-shrink:0">${fmtCLP(e.bankAmt)}</span>`)).join('')
    :'<div style="font-size:12px;color:var(--text2);padding:6px 0">Ninguna coincidencia</div>';

  const sfHTML=sinFacturar.length?sinFacturar.map((e,i)=>fila(`
    <input type="checkbox" class="concilia-aplazar" data-txid="${esc(e.tx.id)}" checked style="width:17px;height:17px;flex-shrink:0;accent-color:var(--yellow)">
    <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.tx.desc)}</div>
    <div style="font-size:11px;color:var(--text2)">${fmtF(e.tx.date)}${e.cuotasTotal>1?' · cuota '+e.cuotaNum+'/'+e.cuotasTotal:''} · no aparece en la cartola</div></div>
    <span style="font-size:13px;font-weight:700;flex-shrink:0">${fmtCLP(e.bankAmt)}</span>`)).join('')
    :'<div style="font-size:12px;color:var(--text2);padding:6px 0">Todo lo esperado aparece en la cartola 🎉</div>';

  const exHTML=extras.length?extras.map((r,i)=>fila(`
    <input type="checkbox" class="concilia-registrar" data-idx="${i}" style="width:17px;height:17px;flex-shrink:0;accent-color:var(--accent)">
    <div style="flex:1;min-width:0">
      <input type="text" id="concilia-desc-${i}" value="${esc(r.desc)}" placeholder="Descripción" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--text);font-size:13px;font-weight:600;margin-bottom:3px;box-sizing:border-box" />
      <div style="font-size:11px;color:var(--text2)">${fmtF(r.date)}${r.cuotas>1?' · '+r.cuotas+' cuotas':''} · está en la cartola, no en la app</div>
    </div>
    <span style="font-size:13px;font-weight:700;flex-shrink:0">${fmtCLP(r.amount)}</span>`)).join('')
    :'<div style="font-size:12px;color:var(--text2);padding:6px 0">Nada sin registrar</div>';

  document.getElementById('concilia-content').innerHTML=`
    <button onclick="renderConciliaSetup()" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:600;cursor:pointer;padding:0;margin-bottom:12px">← Volver</button>
    ${sec('✅ Facturadas ('+ok.length+')','var(--green)',okHTML)}
    ${sec('⏳ No aparecen en la cartola — aplazar al próximo ciclo ('+sinFacturar.length+')','var(--yellow)',sfHTML)}
    ${sec('➕ En la cartola sin registrar — ¿registrar como gasto? ('+extras.length+')','var(--accent2)',exHTML)}
    <button onclick="conciliaConfirm()" class="btn-save" style="width:100%;margin-top:6px">Aplicar conciliación</button>
    <div style="font-size:11px;color:var(--text2);margin-top:10px;line-height:1.5">ℹ️ Marca/desmarca lo que corresponda. Las aplazadas se mueven (compra + deuda) al ciclo siguiente. Las registradas se agregan como gasto de ${CARDS[_conciliaCard].bank} (puedes corregir la descripción) y luego se te preguntará si quieres dividirlas.</div>`;
}

function conciliaConfirm(){
  if(!_conciliaData) return;
  const aplazarIds=[...document.querySelectorAll('.concilia-aplazar:checked')].map(ch=>ch.getAttribute('data-txid'));
  const regIdx=[...document.querySelectorAll('.concilia-registrar:checked')].map(ch=>parseInt(ch.getAttribute('data-idx')));
  // 1) Aplazar en lote: compra + deudas juntas, un ciclo adelante
  if(aplazarIds.length){
    const c=getC();
    c.forEach(t=>{ if(aplazarIds.includes(t.id)) t.cycleOffset=(t.cycleOffset||0)+1; });
    saveC(c);
    const ds=getDeudas();
    let dc=false;
    ds.forEach(d=>{ if(aplazarIds.includes(d.txId)){ d.cycleOffset=(d.cycleOffset||0)+1; dc=true; } });
    if(dc) saveDeudas(ds);
  }
  // 2) Registrar los cargos de la cartola que faltaban en la app, usando la
  // descripcion editada en el input (si el usuario la corrigio)
  const splitItems=[];
  if(regIdx.length){
    const c2=getC();
    regIdx.forEach(i=>{
      const r=_conciliaData.extras[i];
      if(!r) return;
      const descInput=document.getElementById('concilia-desc-'+i);
      const desc=(descInput?descInput.value.trim():'')||r.desc||'Importado';
      const txId='imp_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      c2.push({id:txId, cardId:_conciliaCard,
        amount:r.amount, desc, cuotas:r.cuotas||1, currency:'CLP', date:r.date,
        source:'cartola_concilia', catId:autoCategorize(desc)||''});
      splitItems.push({txId, amount:r.amount, desc, cuotas:r.cuotas||1, currency:'CLP', cardId:_conciliaCard, type:'credito', txDate:r.date});
    });
    saveC(c2);
  }
  closeConciliaModal();
  renderDashboard(); renderDebito(); renderHistorial(); renderDeudas();
  const partes=[];
  if(aplazarIds.length) partes.push(aplazarIds.length+' aplazada'+(aplazarIds.length!==1?'s':''));
  if(regIdx.length) partes.push(regIdx.length+' registrada'+(regIdx.length!==1?'s':''));
  showToast(partes.length?('✅ Conciliación aplicada: '+partes.join(' · ')):'Conciliación revisada: sin cambios');
  // Preguntar si dividir cada compra recien registrada (igual que al importar cartola)
  if(splitItems.length>0){
    _splitQueue=[...splitItems];
    _splitImportMode=true;
    setTimeout(()=>processSplitQueue(),400);
  }
}

document.addEventListener('DOMContentLoaded',function(){
  renderDashboard();renderAjustes();
  handleURLParams();
  syncFromSheets();
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible') syncFromSheets();
  });
  setTimeout(function(){
    checkPaymentReminder();
    if(!document.getElementById('payment-reminder-overlay').classList.contains('open')){
      checkCobroReminder();
      if(!document.getElementById('cobro-reminder-overlay').classList.contains('open')){
        checkServiciosReminder();
        if(!document.getElementById('servicios-reminder-overlay').classList.contains('open')) checkSinClasificarReminder();
      }
    }
  },1200);
});
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js');
  });
}
