# Conversion USD->CLP con valor del dolar configurable en Ajustes.
# Con valor 0 (sin definir) el USD no suma (comportamiento previo); con valor
# definido, los cobros USD se convierten y se suman a los totales en pesos.
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
# Un cobro USD y uno CLP en la tarjeta bci, fechados hoy (caen en el ciclo actual)
Reset-App @'
var hoy=new Date().toISOString();
localStorage.setItem('gastos_credito_v2', JSON.stringify([
 {id:'usd1',cardId:'bci',amount:100,desc:'ANTHROPIC SUB',cuotas:1,currency:'USD',date:hoy},
 {id:'clp1',cardId:'bci',amount:50000,desc:'JUMBO',cuotas:1,currency:'CLP',date:hoy}
]));
localStorage.setItem('misgastos_valor_dolar','0');
'@

Check 'ACLP-HELPER' @'
(function(){
  localStorage.setItem('misgastos_valor_dolar','0');
  const a0=aCLP(100,'USD'), c0=aCLP(500,'CLP');
  localStorage.setItem('misgastos_valor_dolar','900');
  const a9=aCLP(100,'USD'), c9=aCLP(500,'CLP');
  return JSON.stringify({pass: a0===0 && c0===500 && a9===90000 && c9===500, a0,a9,c9});
})()
'@

Check 'DASHBOARD-FOLD-USD' @'
(function(){
  const tot=()=>{let s=0;Object.values(CARDS).forEach(c=>s+=cuotaCLP(c.id)+aCLP(cuotaUSD(c.id),'USD'));return s;};
  let usd=0;Object.values(CARDS).forEach(c=>usd+=cuotaUSD(c.id));
  localStorage.setItem('misgastos_valor_dolar','0'); const base=tot();
  localStorage.setItem('misgastos_valor_dolar','900'); const conv=tot();
  // La diferencia debe ser exactamente el USD del ciclo * 900
  return JSON.stringify({pass: usd>0 && Math.abs((conv-base)-usd*900)<0.01, usd, base, conv, delta:conv-base});
})()
'@

Check 'TXHTML-ESTIMADO' @'
(function(){
  // Sin valor: solo "USD 100.00", sin estimado. Con valor 900: aparece el
  // convertido 90.000 dentro de un <span>. (Evita comparar el simbolo ~ para no
  // depender de la codificacion del archivo de prueba; el valor es lo que importa.)
  const tx={id:'usd1',cardId:'bci',amount:100,desc:'ANTHROPIC',cuotas:1,currency:'USD',date:new Date().toISOString()};
  localStorage.setItem('misgastos_valor_dolar','0'); const h0=txHTML(tx);
  localStorage.setItem('misgastos_valor_dolar','900'); const h1=txHTML(tx);
  return JSON.stringify({pass: h0.indexOf('USD 100.00')>=0 && h0.indexOf('90.000')<0
    && h1.indexOf('USD 100.00')>=0 && h1.indexOf('90.000')>=0 && h1.indexOf('<span')>=0,
    h0_90k:h0.indexOf('90.000')>=0, h1_90k:h1.indexOf('90.000')>=0});
})()
'@

Check 'ANALISIS-FOLD-USD' @'
(function(){
  _analisisModo='compras'; _analisisTxType='credito';
  const gt=()=>agruparPorCategoria(analisisTxsPeriodo(null,null)).grandTotal;
  localStorage.setItem('misgastos_valor_dolar','0'); const g0=gt();
  localStorage.setItem('misgastos_valor_dolar','900'); const g9=gt();
  // g0 solo cuenta el CLP (50000); g9 suma 100*900 del USD
  return JSON.stringify({pass: g0===50000 && Math.abs(g9-(50000+90000))<0.01, g0, g9});
})()
'@

Check 'QUEDEBO-TOTAL-FOLD' @'
(function(){
  localStorage.setItem('misgastos_valor_dolar','900');
  _queDeboPeriod='actual'; renderQueDebo();
  const txt=document.getElementById('quedebo-content').textContent;
  // el estimado del cobro USD (100*900=90.000) debe aparecer
  return JSON.stringify({pass: txt.indexOf('90.000')>=0});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
