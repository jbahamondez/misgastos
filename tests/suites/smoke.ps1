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

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
