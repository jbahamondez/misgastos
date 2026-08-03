# Conciliacion de cartolas: usar el PRECIO del producto (monto operacion), no la
# cuota con interes, y el valor COMPLETO aunque la compra este dividida.
# Datos reales de la cartola Cencosud/Scotia del usuario (aspiradora + freidora).
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App

Check 'MONTO-LINEA-CENCOSUD-CUOTAS' @'
(function(){
  // Xiaomi: [precio 299.990, total 351.030, cuota 58.505] en 6 cuotas -> precio
  // Freidora: [49.990, 55.638, 18.546] en 3 cuotas -> precio
  const xia=montoLineaCartola('EPARIS 299.990 351.030 58.505', 6);
  const fre=montoLineaCartola('EPARIS MARKETPLACE 49.990 55.638 18.546', 3);
  return JSON.stringify({pass: xia===299990 && fre===49990, xia, fre});
})()
'@

Check 'MONTO-LINEA-CONTADO' @'
(function(){
  // contado (1 cuota): toma el monto tal cual (ultimo)
  return JSON.stringify({pass: montoLineaCartola('JUMBO NUNOA 34.825 34.825', 1)===34825
    && montoLineaCartola('JUMBO COSTANERA 62.746', 1)===62746});
})()
'@

Check 'MONTO-LINEA-NO-CENCOSUD-USA-ULTIMO' @'
(function(){
  // linea en cuotas que NO calza con el patron total/nº (otro banco): usa el ultimo
  // 12.000 y 5.000 con 3 cuotas: 12000/3=4000 != 5000 -> no es Cencosud -> ultimo=5000
  return JSON.stringify({pass: montoLineaCartola('TIENDA 12.000 5.000', 3)===5000});
})()
'@

Check 'MONTOREAL-SPLIT-CON-SPLITTOTAL' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'xia1',cardId:'scotia',amount:149995,desc:'ASPIRADORA XIAOMI',cuotas:6,currency:'CLP',date:hoy,splitWith:'Tamarindo',splitTotal:299990}
  ]));
  localStorage.setItem('gastos_deudas_v1','[]');
  return JSON.stringify({pass: montoRealCartola(getC()[0])===299990, v:montoRealCartola(getC()[0])});
})()
'@

Check 'MONTOREAL-RECONSTRUYE-SIN-SPLITTOTAL' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'xia2',cardId:'scotia',amount:149995,desc:'XIAOMI VIEJA',cuotas:6,currency:'CLP',date:hoy,splitWith:'Tamarindo'}
  ]));
  localStorage.setItem('gastos_deudas_v1', JSON.stringify([
    {id:'d2',person:'Tamarindo',txId:'xia2',desc:'XIAOMI VIEJA',type:'credito',totalAmount:149995,cuotas:6,deudaPerCuota:24999,deudaTotal:149995,currency:'CLP',date:hoy,paid:false,paidDate:null}
  ]));
  // 149995 x 2 personas = 299990
  return JSON.stringify({pass: montoRealCartola(getC()[0])===299990, v:montoRealCartola(getC()[0])});
})()
'@

Check 'MONTOREAL-NO-DIVIDIDA' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([{id:'c1',cardId:'scotia',amount:34825,desc:'JUMBO',cuotas:1,currency:'CLP',date:new Date().toISOString()}]));
  localStorage.setItem('gastos_deudas_v1','[]');
  return JSON.stringify({pass: montoRealCartola(getC()[0])===34825});
})()
'@

Check 'CONCILIA-XIAOMI-DIVIDIDA-CALZA' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'xia1',cardId:'scotia',amount:149995,desc:'ASPIRADORA XIAOMI',cuotas:6,currency:'CLP',date:hoy,splitWith:'Tamarindo',splitTotal:299990}
  ]));
  localStorage.setItem('gastos_deudas_v1', JSON.stringify([
    {id:'d1',person:'Tamarindo',txId:'xia1',desc:'ASPIRADORA XIAOMI',type:'credito',totalAmount:299990,cuotas:6,deudaPerCuota:24999,deudaTotal:149995,currency:'CLP',date:hoy,paid:false,paidDate:null}
  ]));
  _conciliaCard='scotia'; _conciliaPeriod='actual';
  // fila de la cartola con el PRECIO (monto operacion) 299.990
  const rows=[{id:'r1',amount:299990,date:hoy,desc:'EPARIS',rawDesc:'EPARIS 299.990 351.030 1/6 58.505',cuotas:6}];
  conciliaMatch(rows);
  const e=_conciliaData.esperadas.find(x=>x.tx.id==='xia1');
  return JSON.stringify({pass: !!e && !!e.match && Math.abs(e.bankAmt-299990)<1 && _conciliaData.extras.length===0,
    bankAmt:e?e.bankAmt:null, matched:!!(e&&e.match), extras:_conciliaData.extras.length});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
