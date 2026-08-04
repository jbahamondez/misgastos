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

Check 'BCI-CONTADO-USA-MONTO' @'
(function(){
  // BCI contado (01/01 => 1 cuota): operacion=total=cargo, toma el monto tal cual
  return JSON.stringify({pass: montoLineaCartola('SMART FIT GIMNASI SANTIAGO 29.900 29.900', 1)===29900
    && montoLineaCartola('NETFLIX LAS CONDES 12.990 12.990', 1)===12990
    && montoLineaCartola('LIDER.CL COMPRA DIR SANTIAGO 155.639 155.639', 1)===155639});
})()
'@

Check 'BCI-CUOTAS-0-INTERES-USA-PRECIO' @'
(function(){
  // BCI en cuotas 0% interes: [operacion, total, cuota] con operacion=total y
  // cuota=total/nº -> toma el PRECIO (operacion), que calza con lo guardado en la app
  const sam=montoLineaCartola('MP SAMSONITE TASA INT 0,00 79.995 79.995 26.665', 3);
  const tea=montoLineaCartola('MERCADOPAGO TEAGROU TASA INT 50.376 50.376 16.792', 3);
  const ike=montoLineaCartola('IKEA OPEN KENNEDY TASA INT 0,00 91.860 91.860 30.620', 3);
  return JSON.stringify({pass: sam===79995 && tea===50376 && ike===91860, sam, tea, ike});
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

Check 'CIERRE-MUEVE-COMPRA-Y-DEUDA-JUNTAS' @'
(function(){
  // Compra dia 20 en scotia, dividida 50/50 con Tamarindo (crea la deuda)
  const txDate='2026-07-20T12:00:00';
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'p20',cardId:'scotia',amount:50000,desc:'COMPRA DIA 20',cuotas:1,currency:'CLP',date:txDate}
  ]));
  localStorage.setItem('gastos_deudas_v1','[]');
  aplicarSplit({txId:'p20',amount:50000,desc:'COMPRA DIA 20',cuotas:1,currency:'CLP',type:'credito',txDate:txDate},['Tamarindo'],false);
  const tx=getC().find(t=>t.id==='p20');
  const deuda=getDeudas().find(d=>d.txId==='p20');
  const idxTx=c=>queDeboCycleIndex(tx.date,c)+(tx.cycleOffset||0);
  const idxDeuda=c=>queDeboCycleIndex(deuda.date,c)+(deuda.cycleOffset||0);
  const con19_tx=idxTx(19), con19_d=idxDeuda(19), con20_tx=idxTx(20), con20_d=idxDeuda(20);
  return JSON.stringify({
    // misma fecha; compra y deuda en el MISMO ciclo con 19 y con 20; y con 20 se adelantan 1 ciclo juntas
    pass: deuda.date===tx.date && con19_tx===con19_d && con20_tx===con20_d && con20_tx===con19_tx-1,
    mismaFecha:deuda.date===tx.date, con19_tx, con19_d, con20_tx, con20_d
  });
})()
'@

Check 'FINANCIADO-ESCALA-CUOTA-Y-DEUDA' @'
(function(){
  const hoy=new Date().toISOString();
  // Xiaomi 50/50: precio 299.990, financiado 351.030 (factor 1,17). Cuota real
  // completa = 58.505; tu mitad y la de Tamarindo = 29.252,5 c/u.
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'xf',cardId:'scotia',amount:149995,desc:'XIAOMI',cuotas:6,currency:'CLP',date:hoy,splitWith:'Tamarindo',splitTotal:299990,montoFinanciado:351030}
  ]));
  localStorage.setItem('gastos_deudas_v1', JSON.stringify([
    {id:'df',person:'Tamarindo',txId:'xf',desc:'XIAOMI',type:'credito',totalAmount:299990,cuotas:6,deudaPerCuota:24999.1667,deudaTotal:149995,currency:'CLP',date:hoy,paid:false,paidDate:null}
  ]));
  const f=factorFinanciado(getC()[0]);
  const act=cuotasActivasCiclo('scotia',0).filter(x=>x.tx.id==='xf');
  const tuCuota=act.length?act[0].cuotaAmt:0;
  const inst=deudaInstallments().filter(i=>i.d.id==='df');
  const deudaCuota=inst.length?inst[0].amt:0;
  return JSON.stringify({
    pass: Math.abs(f-1.170139)<0.001 && Math.abs(tuCuota-29252.5)<1 && Math.abs(deudaCuota-29252.5)<1,
    f:Math.round(f*100000)/100000, tuCuota:Math.round(tuCuota), deudaCuota:Math.round(deudaCuota)
  });
})()
'@

Check 'FINANCIADO-SIN-CAMPO-FACTOR-1' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'xn',cardId:'scotia',amount:149995,desc:'XIAOMI',cuotas:6,currency:'CLP',date:new Date().toISOString(),splitWith:'Tamarindo',splitTotal:299990}
  ]));
  localStorage.setItem('gastos_deudas_v1','[]');
  return JSON.stringify({pass: factorFinanciado(getC()[0])===1});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
