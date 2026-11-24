# Smoke: la app arranca y todas las vistas renderizan sin errores JS.
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App @'
localStorage.setItem('sueldo_mensual','1500000');
localStorage.setItem('gastos_credito_v2', JSON.stringify([
 {id:'c1',cardId:'bci',amount:60000,desc:'JUMBO',cuotas:3,currency:'CLP',date:'2026-05-10T12:00:00.000Z',catId:'super'},
 {id:'c2',cardId:'bchile',amount:120000,desc:'TV',cuotas:12,currency:'CLP',date:'2026-01-25T12:00:00.000Z',catId:'tech'}
]));
localStorage.setItem('gastos_debito_v2', JSON.stringify([
 {id:'d1',bank:'bci',amount:25000,desc:'LIDER',currency:'CLP',date:'2026-07-01T12:00:00.000Z',catId:'super'}
]));
'@

Check 'RENDER-TODAS-LAS-VISTAS' @'
(function(){
  renderDashboard(); renderTarjetas(); renderDebito();
  activeDateFilter='todo'; activeFilter='all'; renderHistorial();
  renderDeudas(); renderAjustes();
  _analisisModo='cuotas'; _analisisPeriod='todo'; _analisisTxType='ambos'; renderAnalisis();
  _queDeboPeriod='actual'; renderQueDebo();
  const w=document.getElementById('dash-main-widget').textContent.includes('$');
  const h=document.getElementById('hist-list').children.length>0;
  const a=document.getElementById('page-ajustes').textContent.includes('Servicios del hogar');
  return JSON.stringify({pass: w&&h&&a, widget:w, hist:h, ajustes:a});
})()
'@

Check 'TOAST-SOLAPADOS-NO-CORTA' @'
(async function(){
  // varios toasts seguidos: el ultimo NO debe cortarse por el timer del primero
  showToast("A");
  await new Promise(r=>setTimeout(r,1000)); showToast("B");
  await new Promise(r=>setTimeout(r,1000)); showToast("C");
  await new Promise(r=>setTimeout(r,900)); // ~2900 desde A
  const visEnMedio=document.getElementById("toast").classList.contains("show");
  await new Promise(r=>setTimeout(r,3200));
  const alFinal=document.getElementById("toast").classList.contains("show");
  return JSON.stringify({pass: visEnMedio && !alFinal, visEnMedio, alFinal});
})()
'@

Check 'TOAST-HIDE-EN-BACKGROUND' @'
(function(){
  showToast("X");
  const antes=document.getElementById("toast").classList.contains("show");
  hideToast(); // lo que dispara el handler de visibilitychange al pasar a segundo plano
  const despues=document.getElementById("toast").classList.contains("show");
  return JSON.stringify({pass: antes && !despues && _toastTimer===null});
})()
'@

Check 'TOAST-VISIBILITYCHANGE-OCULTA' @'
(function(){
  showToast("Y");
  let ok=false;
  try{
    Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});
    document.dispatchEvent(new Event("visibilitychange"));
    ok=!document.getElementById("toast").classList.contains("show");
  } finally { try{ delete document.visibilityState; }catch(e){} }
  return JSON.stringify({pass:ok});
})()
'@

Check 'SYNC-MANUAL-403-AVISA' @'
(async function(){
  const of=window.fetch, os=window.showToast; let msg="";
  window.fetch=async()=>({ok:false,status:403,text:async()=>"denied"});
  window.showToast=(m)=>{msg=m||"";};
  try{
    const res=await syncFromSheets({manual:true});
    return JSON.stringify({pass: res&&res.error==="http" && res.status===403 && /acceso|HTTP 403/i.test(msg), res, msg});
  } finally { window.fetch=of; window.showToast=os; }
})()
'@

Check 'SYNC-MANUAL-HTML-ACCESO-AVISA' @'
(async function(){
  const of=window.fetch, os=window.showToast; let msg="";
  window.fetch=async()=>({ok:true,status:200,text:async()=>"<!DOCTYPE html><title>Acceso denegado</title>Necesitas acceso"});
  window.showToast=(m)=>{msg=m||"";};
  try{
    const res=await syncFromSheets({manual:true});
    return JSON.stringify({pass: res&&res.error==="parse" && /sesi|Cualquier persona/i.test(msg), res, msg});
  } finally { window.fetch=of; window.showToast=os; }
})()
'@

Check 'SYNC-MANUAL-SIN-NOVEDAD-AVISA' @'
(async function(){
  const of=window.fetch, os=window.showToast; let msg="";
  window.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({rows:[]})});
  window.showToast=(m)=>{msg=m||"";};
  try{
    const res=await syncFromSheets({manual:true});
    return JSON.stringify({pass: res&&res.imported===0 && /nuevas|sincronizar/i.test(msg), res, msg});
  } finally { window.fetch=of; window.showToast=os; }
})()
'@

Check 'SYNC-BOTON-EN-AJUSTES' @'
(function(){
  renderAjustes();
  const ok=/Sincronizar correos ahora/.test(document.getElementById("page-ajustes").innerHTML)
        && typeof syncManual==="function";
  return JSON.stringify({pass:ok});
})()
'@

Check 'SYNC-DEDUP-MISMO-CORREO-DOS-FILAS' @'
(async function(){
  const of=window.fetch, os=window.showToast;
  localStorage.setItem("gastos_credito_v2","[]");
  window.showToast=function(){};
  window.fetch=async function(u){
    if(String(u).indexOf("getPending")>=0) return {ok:true,status:200,text:async()=>JSON.stringify({rows:[
      ["sheet_5_23990_2026-09-05T14:30:00","bci","credito",23990,"JUMBO",1,"CLP","2026-09-05T14:30:00"],
      ["sheet_9_23990_2026-09-05T14:30:00","bci","credito",23990,"JUMBO",1,"CLP","2026-09-05T14:30:00"]
    ]})};
    return {ok:true,status:200,text:async()=>"{}"};
  };
  try{
    await syncFromSheets({manual:true});
    const jumbos=getC().filter(t=>t.desc==="JUMBO");
    return JSON.stringify({pass: jumbos.length===1, n:jumbos.length});
  } finally { window.fetch=of; window.showToast=os; localStorage.setItem("gastos_credito_v2","[]"); }
})()
'@

Check 'SYNC-NO-BORRA-COMPRAS-DISTINTAS' @'
(async function(){
  const of=window.fetch, os=window.showToast;
  localStorage.setItem("gastos_credito_v2","[]");
  window.showToast=function(){};
  window.fetch=async function(u){
    if(String(u).indexOf("getPending")>=0) return {ok:true,status:200,text:async()=>JSON.stringify({rows:[
      ["sheet_5_23990_2026-09-05T14:30:00","bci","credito",23990,"JUMBO",1,"CLP","2026-09-05T14:30:00"],
      ["sheet_6_23990_2026-09-05T18:05:00","bci","credito",23990,"JUMBO",1,"CLP","2026-09-05T18:05:00"]
    ]})};
    return {ok:true,status:200,text:async()=>"{}"};
  };
  try{
    await syncFromSheets({manual:true});
    const jumbos=getC().filter(t=>t.desc==="JUMBO");
    return JSON.stringify({pass: jumbos.length===2, n:jumbos.length});
  } finally { window.fetch=of; window.showToast=os; localStorage.setItem("gastos_credito_v2","[]"); }
})()
'@

Check 'SANTANDER-EN-TODAS-LAS-LISTAS' @'
(function(){
  renderAjustes();
  var bill=document.getElementById("billing-dates-list").innerHTML.indexOf("Santander")>=0;
  var pay=document.getElementById("payment-dates-list").innerHTML.indexOf("Santander")>=0;
  var cupos=document.getElementById("settings-cards-list").innerHTML.indexOf("Santander")>=0;
  activeDateFilter="todo"; activeFilter="all"; renderHistorial();
  var filtro=document.getElementById("filter-row").innerHTML.toLowerCase().indexOf("santander")>=0;
  selectImportType("credito"); // los chips de importar dependen del tipo; santander es crédito
  var chip=!!document.getElementById("chip-santander");
  var mcard=document.getElementById("m-card").innerHTML.indexOf("santander")>=0;
  var enCards=!!CARDS.santander;
  return JSON.stringify({pass: bill&&pay&&cupos&&filtro&&chip&&mcard&&enCards, bill:bill,pay:pay,cupos:cupos,filtro:filtro,chip:chip,mcard:mcard,enCards:enCards});
})()
'@

Check 'DEBITO-CUENTAS-CONFIGURABLES' @'
(function(){
  renderAjustes();
  var md=document.getElementById("m-debit-bank").innerHTML;
  var listHTML=document.getElementById("settings-cards-list").innerHTML;
  var mdDinamico = md.indexOf("BCI")>=0;                 // selector poblado desde DEBITS
  var listaDebito = listHTML.indexOf("Cuentas de d")>=0; // sección de débito en Ajustes
  var seedOK = !!DEBITS.bci;                             // cuentas sembradas
  // agregar una cuenta nueva y comprobar que entra
  saveDebits(getDebits().concat([{id:"acct_test",bank:"TestBank",color:"#123456",emoji:"🏦",tipo:"debito"}]));
  var agregada = !!DEBITS.acct_test;
  // un gasto de débito con esa cuenta debe resolver su nombre
  var nombreOK = debitMeta("acct_test") && debitMeta("acct_test").bank==="TestBank";
  return JSON.stringify({pass: mdDinamico&&listaDebito&&seedOK&&agregada&&nombreOK, mdDinamico:mdDinamico,listaDebito:listaDebito,seedOK:seedOK,agregada:agregada,nombreOK:!!nombreOK});
})()
'@

Check 'AUTH-GATE-Y-ONBOARDING' @'
(function(){
  var gate=document.getElementById("auth-gate");
  window._fb=window._fb||{};
  window._fb.user=null; renderAuthGate();
  var visibleSinSesion = gate.style.display!=="none";
  window._fb.user={email:"ana@correo.cl",uid:"u1"}; renderAuthGate();
  var ocultoConSesion = gate.style.display==="none";
  renderDashboard();
  var saludoPersonal = document.getElementById("dash-greeting").textContent.indexOf("ana")>=0;
  // onboarding: usuario sin datos ve la bienvenida
  localStorage.setItem("gastos_credito_v2","[]"); localStorage.setItem("gastos_debito_v2","[]");
  var _c=CARDS, _d=DEBITS; CARDS={}; DEBITS={};
  document.getElementById("welcome-overlay").classList.remove("open");
  maybeShowOnboarding();
  var onboardingVisible = document.getElementById("welcome-overlay").classList.contains("open");
  CARDS=_c; DEBITS=_d; window._fb.user=null; renderAuthGate();
  return JSON.stringify({pass: visibleSinSesion&&ocultoConSesion&&saludoPersonal&&onboardingVisible, visibleSinSesion:visibleSinSesion,ocultoConSesion:ocultoConSesion,saludoPersonal:saludoPersonal,onboardingVisible:onboardingVisible});
})()
'@

Check 'VOZ-PARSEA-Y-PRELLENA' @'
(function(){
  var a=parseVoiceExpense("gasté 3 mil pesos en jumbo costanera con tarjeta santander");
  var b=parseVoiceExpense("pague 15 lucas en uber con debito bci");
  var c=parseVoiceExpense("compré 25990 en tienda en 6 cuotas con santander");
  // prellenado del modal de gasto manual con lo que entendió la voz
  openModalPrefilled(a);
  var amt=document.getElementById("m-amount").value;
  var card=document.getElementById("m-card").value;
  var desc=document.getElementById("m-desc").value;
  closeModal();
  var ok = a.amount===3000 && a.cardId==="santander" && a.tipo==="credito" && a.desc.toLowerCase().indexOf("jumbo")>=0
    && b.amount===15000 && b.tipo==="debito" && b.bank==="bci"
    && c.amount===25990 && c.cuotas===6
    && amt==="3000" && card==="santander" && desc.toLowerCase().indexOf("jumbo")>=0;
  return JSON.stringify({pass:ok, a:a,b:b,c:c,amt:amt,card:card,desc:desc});
})()
'@

Check 'ACENTO-SELECTOR' @'
(function(){
  renderAjustes();
  var picker=document.getElementById("accent-picker");
  var hasSw=picker && picker.querySelectorAll(".accent-sw").length>=6;
  setAccent("blanco");
  var applied=document.documentElement.getAttribute("data-accent")==="blanco";
  var saved=localStorage.getItem("misgastos_accent")==="blanco";
  setAccent("");
  var cleared=!document.documentElement.getAttribute("data-accent");
  return JSON.stringify({pass: hasSw&&applied&&saved&&cleared, hasSw:hasSw,applied:applied,saved:saved,cleared:cleared});
})()
'@

Check 'PERSONAS-DEFAULT-E-IMPORT-POR-TIPO' @'
(function(){
  localStorage.setItem("deudas_personas_v1", JSON.stringify(["Ana","Beto"]));
  localStorage.removeItem("misgastos_default_split_persons");
  toggleDefaultSplitPerson("Beto"); // marca Beto como favorito
  var marcado=getDefaultSplitPersons().indexOf("Beto")>=0;
  _splitImportMode=false; _splitQueue=[];
  _pendingSplit={txId:"z",amount:10000,desc:"X",cuotas:1,currency:"CLP",cardId:"bci",type:"credito",txDate:new Date().toISOString()};
  openSplitModal(_pendingSplit);
  var sel=_splitSelectedPersons.slice();
  document.getElementById("split-modal-overlay").classList.remove("open"); _pendingSplit=null;
  var preselOK = sel.length===1 && sel[0]==="Beto";
  selectImportType("debito");  var cd = !!document.getElementById("chip-bci") && !document.getElementById("chip-santander");
  selectImportType("credito"); var cc = !!document.getElementById("chip-santander");
  return JSON.stringify({pass: marcado&&preselOK&&cd&&cc, marcado:marcado,preselOK:preselOK,cd:cd,cc:cc,sel:sel});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
