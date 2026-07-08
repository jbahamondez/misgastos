# XSS almacenado: payloads en desc/persona/categoria/servicio/splitWith/id y en
# la URL deben quedar INERTES (mostrarse como texto, no ejecutarse) en todas las
# vistas, sin romper handlers con comillas.
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App @'
window.__xss=0;
const PAY='<img src=x onerror="window.__xss=1">';
const PAY2='"><svg onload="window.__xss=2">';
const PAYQ="x'),window.__xss=3,('";
localStorage.setItem('gastos_credito_v2', JSON.stringify([
 {id:'m1',cardId:'bci',amount:50000,desc:PAY,cuotas:2,currency:'CLP',date:'2026-06-25T12:00:00.000Z',catId:'evil'},
 {id:'m2',cardId:'bci',amount:30000,desc:'NORMAL '+PAY2,cuotas:1,currency:'CLP',date:'2026-07-01T12:00:00.000Z',splitWith:PAY,splitTotal:60000,catId:''}
]));
localStorage.setItem('gastos_debito_v2', JSON.stringify([
 {id:'md1',bank:'bci',amount:15000,desc:PAY2,currency:'CLP',date:'2026-07-03T12:00:00.000Z',catId:''}
]));
localStorage.setItem('gastos_deudas_v1', JSON.stringify([
 {id:'de1',person:PAY,txId:'m2',desc:PAY,type:'credito',totalAmount:60000,cuotas:1,deudaPerCuota:30000,deudaTotal:30000,currency:'CLP',date:'2026-07-01T12:00:00.000Z',paid:false,paidDate:null},
 {id:'de2',person:"O'Higgins",txId:'m1',desc:'NORMAL',type:'credito',totalAmount:50000,cuotas:2,deudaPerCuota:12500,deudaTotal:25000,currency:'CLP',date:'2026-06-25T12:00:00.000Z',paid:false,paidDate:null}
]));
localStorage.setItem('deudas_personas_v1', JSON.stringify([PAY,"O'Higgins",PAYQ]));
localStorage.setItem('misgastos_categorias_v1', JSON.stringify([{id:'evil',name:PAY,emoji:PAY2,color:'#4CAF50"onmouseover="window.__xss=5'}]));
localStorage.setItem('misgastos_cat_rules_v1', JSON.stringify([{keyword:PAY,catId:'evil'}]));
localStorage.setItem('misgastos_servicios_hogar_v1', JSON.stringify([{id:'sv1',emoji:PAY2,name:PAY,day:28}]));
'@

Check 'XSS-NO-EJECUTA' @'
(async function(){
  renderDashboard(); renderTarjetas(); renderDebito();
  activeDateFilter='todo'; activeFilter='all'; renderHistorial();
  renderDeudas(); renderAjustes();
  _analisisModo='cuotas'; _analisisPeriod='todo'; _analisisTxType='ambos'; _analisisCatDetalle=null; renderAnalisis();
  openAnalisisCatDetalle('evil'); _analisisCatDetalle=null;
  _queDeboPeriod='actual'; renderQueDebo();
  checkSinClasificarReminder(); checkServiciosReminder();
  _pendingSplit={txId:'m1',amount:50000,desc:'<img src=x onerror="window.__xss=6">',cuotas:2,currency:'CLP',cardId:'bci'};
  _splitSelectedPersons=['<img src=x onerror="window.__xss=7">']; _splitLent=false;
  renderPersonChips(); updateSplitPreview();
  openEditModal('m2','credito'); closeEditModal();
  await new Promise(r=>setTimeout(r,600));
  const imgs=[...document.querySelectorAll('img')].filter(i=>i.getAttribute('src')==='x');
  const svgs=[...document.querySelectorAll('svg[onload]')];
  return JSON.stringify({pass: window.__xss===0 && imgs.length===0 && svgs.length===0, xss:window.__xss, imgs:imgs.length, svgs:svgs.length});
})()
'@

Check 'XSS-VISIBLE-COMO-TEXTO' @'
(function(){
  activeDateFilter='todo'; activeFilter='all'; renderHistorial();
  const t=document.getElementById('hist-list').textContent;
  return JSON.stringify({pass: t.includes('<img src=x onerror=')&&t.includes('NORMAL "><svg')});
})()
'@

Check 'XSS-HANDLER-CON-COMILLA-OK' @'
(function(){
  _splitSelectedPersons=[]; renderPersonChips();
  const chips=[...document.querySelectorAll('#person-chips .person-chip')];
  const oh=chips.find(c=>c.textContent.includes("O'Higgins")); if(oh) oh.click();
  const ev=chips.find(c=>c.textContent.includes("x'),")); if(ev) ev.click();
  return JSON.stringify({pass: _splitSelectedPersons.includes("O'Higgins") && _splitSelectedPersons.some(p=>p.includes("x'),")) && window.__xss===0, sel:_splitSelectedPersons.length});
})()
'@

Check 'XSS-URL-PARAM-SANEADO' @'
(async function(){
  history.replaceState({},'','?amount=1500&desc='+encodeURIComponent('<script>window.__xss=9<\/script>PROBE')+'&type=credito&bank=zzz&cuotas=99');
  handleURLParams();
  await new Promise(r=>setTimeout(r,300));
  const tx=getC().find(t=>(t.desc||'').includes('PROBE'));
  renderDashboard();
  await new Promise(r=>setTimeout(r,300));
  const ok = !!tx && tx.cardId==='bci' && tx.cuotas<=48 && window.__xss===0 && document.getElementById('recent-list').textContent.includes('PROBE');
  return JSON.stringify({pass:ok, cardId:tx?tx.cardId:null, cuotas:tx?tx.cuotas:null, xss:window.__xss});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
