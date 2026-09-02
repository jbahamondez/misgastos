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

Check 'MONTOFINANCIADO-LINEA' @'
(function(){
  const xia=montoFinanciadoLinea('EPARIS 299.990 351.030 58.505', 6); // con interes -> 351.030
  const bci=montoFinanciadoLinea('MP SAMSONITE 79.995 79.995 26.665', 3); // 0% (total=precio) -> 0
  const con=montoFinanciadoLinea('JUMBO 34.825 34.825', 1); // contado -> 0
  return JSON.stringify({pass: xia===351030 && bci===0 && con===0, xia, bci, con});
})()
'@

Check 'CONCILIA-APRENDE-INTERES' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'xi',cardId:'scotia',amount:149995,desc:'ASPIRADORA XIAOMI',cuotas:6,currency:'CLP',date:hoy,splitWith:'Tamarindo',splitTotal:299990}
  ]));
  localStorage.setItem('gastos_deudas_v1', JSON.stringify([
    {id:'d1',person:'Tamarindo',txId:'xi',desc:'ASPIRADORA XIAOMI',type:'credito',totalAmount:299990,cuotas:6,deudaPerCuota:24999.1667,deudaTotal:149995,currency:'CLP',date:hoy,paid:false,paidDate:null}
  ]));
  _conciliaCard='scotia'; _conciliaPeriod='actual';
  // fila de cartola: precio 299.990 (match) y financiado 351.030 (interes a aprender)
  conciliaMatch([{id:'r1',amount:299990,montoFinanciado:351030,date:hoy,desc:'EPARIS',rawDesc:'EPARIS 299.990 351.030 1/6 58.505',cuotas:6}]);
  conciliaConfirm();
  const tx=getC().find(t=>t.id==='xi')||{};
  return JSON.stringify({pass: tx.montoFinanciado===351030 && Math.abs(factorFinanciado(tx)-1.170139)<0.001, mf:tx.montoFinanciado});
})()
'@

Check 'PARSE-PERIODO-CARTOLA' @'
(function(){
  // BCI: ignora ANTERIOR y PROXIMO, toma el PERIODO FACTURADO actual (20/06-22/07)
  const bci=parsePeriodoCartola([
    'PERIODO DE FACTURACION ANTERIOR 20/05/2026 19/06/2026',
    'PERIODO FACTURADO 20-06-2026 22-07-2026',
    'PROXIMO PERIODO DE FACTURACION 23/07/2026 20/08/2026'
  ]);
  // Cencosud: PERIODO FACTURADO 21/06-20/07 (ignora el ANTERIOR)
  const cen=parsePeriodoCartola(['PERIODO FACTURADO 21/06/2026 20/07/2026','PERIODO FACTURADO ANTERIOR 21/05/2026 20/06/2026']);
  const okBci = bci && bci.desde.getDate()===20 && bci.desde.getMonth()===5 && bci.hasta.getDate()===22 && bci.hasta.getMonth()===6;
  const okCen = cen && cen.desde.getDate()===21 && cen.desde.getMonth()===5 && cen.hasta.getDate()===20 && cen.hasta.getMonth()===6;
  return JSON.stringify({pass: okBci && okCen, bci:okBci, cen:okCen});
})()
'@

Check 'CONCILIA-PERIODO-CONTADO-CALZA' @'
(function(){
  // Contado 20/21/24 jun (borde) deben calzar por el periodo real; el 25/jul queda fuera.
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'c20',cardId:'bci',amount:10960,desc:'IKEA 20jun',cuotas:1,currency:'CLP',date:'2026-06-20T12:00:00'},
    {id:'c21',cardId:'bci',amount:3600,desc:'JUMBO 21jun',cuotas:1,currency:'CLP',date:'2026-06-21T12:00:00'},
    {id:'c24',cardId:'bci',amount:5850,desc:'PARKING 24jun',cuotas:1,currency:'CLP',date:'2026-06-24T12:00:00'},
    {id:'c25j',cardId:'bci',amount:45320,desc:'FUERA 25jul',cuotas:1,currency:'CLP',date:'2026-07-25T12:00:00'}
  ]));
  localStorage.setItem('gastos_deudas_v1','[]');
  localStorage.setItem('misgastos_billing_dates', JSON.stringify({bci:22}));
  _conciliaCard='bci'; _conciliaPeriod='cerrado';
  const periodo={desde:new Date(2026,5,20,0,0,0), hasta:new Date(2026,6,22,23,59,59)};
  const esp=conciliaEsperadas('bci',-1,periodo).map(e=>e.tx.id);
  const rows=[
    {id:'r20',amount:10960,date:'2026-06-20T12:00:00',desc:'IKEA',cuotas:1},
    {id:'r21',amount:3600,date:'2026-06-21T12:00:00',desc:'JUMBO',cuotas:1},
    {id:'r24',amount:5850,date:'2026-06-24T12:00:00',desc:'PARKING',cuotas:1}
  ];
  rows.periodo=periodo;
  conciliaMatch(rows);
  const facturadas=_conciliaData.esperadas.filter(e=>e.match).length;
  const sinFacturar=_conciliaData.esperadas.filter(e=>!e.match).length;
  return JSON.stringify({
    // se esperan las 3 de junio (no la del 25 jul); calzan las 3; NADIE va a aplazar; sin extras
    pass: esp.indexOf('c20')>=0 && esp.indexOf('c21')>=0 && esp.indexOf('c24')>=0 && esp.indexOf('c25j')<0
       && facturadas===3 && sinFacturar===0 && _conciliaData.extras.length===0,
    esp, facturadas, sinFacturar, extras:_conciliaData.extras.length
  });
})()
'@

Check 'DEBITO-DEUDA-CICLO-ANTERIOR' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_debito_v2', JSON.stringify([{id:'db1',bank:'bci',amount:20000,desc:'DEBITO HOGAR',currency:'CLP',date:hoy}]));
  localStorage.setItem('gastos_deudas_v1','[]');
  const offA=offsetCicloDeuda(hoy,'actual'), offAn=offsetCicloDeuda(hoy,'anterior');
  aplicarSplit({txId:'db1',amount:20000,desc:'DEBITO HOGAR',cuotas:1,currency:'CLP',type:'debito',txDate:hoy},['Tamarindo'],false, offsetCicloDeuda(hoy,'anterior'));
  const d=getDeudas().find(x=>x.txId==='db1');
  const inst=deudaInstallments().filter(i=>i.d.id===d.id);
  return JSON.stringify({pass: offA===0 && offAn===-1 && d.cycleOffset===-1 && inst.length===1 && inst[0].section==='anterior',
    offA, offAn, cycleOffset:d.cycleOffset, sec:inst.length?inst[0].section:'?'});
})()
'@

Check 'DEBITO-DEUDA-CICLO-ACTUAL-DEFAULT' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_debito_v2', JSON.stringify([{id:'db2',bank:'bci',amount:15000,desc:'D2',currency:'CLP',date:hoy}]));
  localStorage.setItem('gastos_deudas_v1','[]');
  aplicarSplit({txId:'db2',amount:15000,desc:'D2',cuotas:1,currency:'CLP',type:'debito',txDate:hoy},['Tamarindo'],false, offsetCicloDeuda(hoy,'actual'));
  const d=getDeudas().find(x=>x.txId==='db2');
  const inst=deudaInstallments().filter(i=>i.d.id===d.id);
  return JSON.stringify({pass: (d.cycleOffset===undefined||d.cycleOffset===0) && inst[0].section==='actual', cycleOffset:d.cycleOffset, sec:inst[0].section});
})()
'@

Check 'SPLIT-CICLO-UI-SOLO-DEBITO' @'
(function(){
  _splitImportMode=false; _splitQueue=[];
  _pendingSplit={txId:'x',amount:10000,desc:'D',cuotas:1,currency:'CLP',cardId:'bci',type:'debito',txDate:new Date().toISOString()};
  openSplitModal(_pendingSplit);
  const debVis=document.getElementById('split-ciclo-row').style.display!=='none';
  const defActual=_splitCiclo==='actual';
  setSplitCiclo('anterior'); const cambio=_splitCiclo==='anterior';
  _pendingSplit={txId:'y',amount:10000,desc:'C',cuotas:1,currency:'CLP',cardId:'bci',type:'credito',txDate:new Date().toISOString()};
  openSplitModal(_pendingSplit);
  const credOculto=document.getElementById('split-ciclo-row').style.display==='none';
  const reset=_splitCiclo==='actual';
  document.getElementById('split-modal-overlay').classList.remove('open'); _pendingSplit=null;
  return JSON.stringify({pass: debVis && defActual && cambio && credOculto && reset, debVis, credOculto, reset});
})()
'@

Check 'PRESTAMO-CATEGORIA-AUTO' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([{id:'p1',cardId:'bci',amount:50000,desc:'PRESTAMO AMIGO',cuotas:1,currency:'CLP',date:new Date().toISOString(),catId:''}]));
  localStorage.setItem('gastos_deudas_v1','[]');
  localStorage.removeItem('misgastos_categorias_v1');
  const antes=getCategorias().some(c=>c.id==='prestamos');
  aplicarSplit({txId:'p1',amount:50000,desc:'PRESTAMO AMIGO',cuotas:1,currency:'CLP',type:'credito',txDate:new Date().toISOString()},['Juan'], true);
  const tx=getC().find(t=>t.id==='p1');
  return JSON.stringify({pass: !antes && getCategorias().some(c=>c.id==='prestamos') && tx.catId==='prestamos' && tx.lent===true, catId:tx.catId});
})()
'@

Check 'PRESTAMO-NO-INFLUYE-ANALISIS' @'
(function(){
  localStorage.setItem('misgastos_valor_dolar','0');
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'p1',cardId:'bci',amount:50000,desc:'PRESTAMO',cuotas:1,currency:'CLP',date:new Date().toISOString(),catId:'prestamos',lent:true,splitWith:'Juan',splitTotal:50000},
    {id:'g1',cardId:'bci',amount:30000,desc:'JUMBO',cuotas:1,currency:'CLP',date:new Date().toISOString(),catId:'super'}
  ]));
  _analisisModo='compras'; _analisisTxType='credito';
  const {catData,grandTotal}=agruparPorCategoria(analisisTxsPeriodo(null,null));
  // el prestamo NO suma ni aparece; solo el JUMBO (30000)
  return JSON.stringify({pass: !catData.some(c=>c.id==='prestamos') && grandTotal===30000, grandTotal});
})()
'@

Check 'PRESTAMO-NO-EN-RECORDATORIO' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'p1',cardId:'bci',amount:50000,desc:'PRESTAMOXYZ',cuotas:1,currency:'CLP',date:new Date().toISOString(),catId:'',lent:true},
    {id:'s1',cardId:'bci',amount:10000,desc:'SINCATXYZ',cuotas:1,currency:'CLP',date:new Date().toISOString(),catId:''}
  ]));
  localStorage.setItem('gastos_debito_v2','[]');
  checkSinClasificarReminder();
  const overlay=document.getElementById('sinclasificar-reminder-overlay');
  const cont=document.getElementById('sinclasificar-reminder-list').textContent;
  const pass = overlay.classList.contains('open') && cont.indexOf('SINCATXYZ')>=0 && cont.indexOf('PRESTAMOXYZ')<0;
  overlay.classList.remove('open');
  return JSON.stringify({pass});
})()
'@

Check 'PRESTAMO-REVERT-LIMPIA-CAT' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([{id:'p1',cardId:'bci',amount:50000,desc:'X',cuotas:1,currency:'CLP',date:new Date().toISOString(),catId:'prestamos',lent:true,splitWith:'Juan',splitTotal:50000}]));
  localStorage.setItem('gastos_deudas_v1','[]');
  aplicarSplit({txId:'p1',amount:50000,desc:'X',cuotas:1,currency:'CLP',type:'credito',txDate:new Date().toISOString()},['Juan'], false);
  const tx=getC().find(t=>t.id==='p1');
  return JSON.stringify({pass: tx.catId==='' && !tx.lent, catId:tx.catId, lent:tx.lent});
})()
'@

Check 'EDIT-ESCALA-DEUDA' @'
(function(){
  const hoy=new Date().toISOString();
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'e1',cardId:'bci',amount:75000,desc:'COMPRA',cuotas:1,currency:'CLP',date:hoy,splitWith:'Tamarindo',splitTotal:150000}
  ]));
  localStorage.setItem('gastos_deudas_v1', JSON.stringify([
    {id:'d1',person:'Tamarindo',txId:'e1',desc:'COMPRA',type:'credito',totalAmount:150000,cuotas:1,deudaPerCuota:75000,deudaTotal:75000,currency:'CLP',date:hoy,paid:false,paidDate:null}
  ]));
  _editTxId='e1'; _editTxType='credito';
  document.getElementById('edit-desc').value='COMPRA';
  document.getElementById('edit-amount').value='80000';
  populateCatSelect('edit-cat',''); document.getElementById('edit-cat').value='';
  confirmEditTx();
  const tx=getC().find(t=>t.id==='e1'), d=getDeudas().find(x=>x.id==='d1');
  // factor 80000/75000: splitTotal 150000->160000; deuda 75000->80000
  return JSON.stringify({pass: tx.amount===80000 && Math.abs(tx.splitTotal-160000)<1 && Math.abs(d.deudaTotal-80000)<1 && Math.abs(d.deudaPerCuota-80000)<1,
    amount:tx.amount, splitTotal:Math.round(tx.splitTotal), deudaTotal:Math.round(d.deudaTotal)});
})()
'@

Check 'EDIT-SIN-DEUDA-OK' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([{id:'e2',cardId:'bci',amount:20000,desc:'X',cuotas:1,currency:'CLP',date:new Date().toISOString()}]));
  localStorage.setItem('gastos_deudas_v1','[]');
  _editTxId='e2'; _editTxType='credito';
  document.getElementById('edit-desc').value='X EDIT';
  document.getElementById('edit-amount').value='25000';
  populateCatSelect('edit-cat',''); document.getElementById('edit-cat').value='';
  confirmEditTx();
  const tx=getC().find(t=>t.id==='e2');
  return JSON.stringify({pass: tx.amount===25000 && tx.desc==='X EDIT'});
})()
'@

Check 'EDIT-APLAZAR-CICLO' @'
(function(){
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'rv',cardId:'bci',amount:50376,desc:'Regalo Vale',cuotas:3,currency:'CLP',date:'2026-05-21T04:00:00.000Z'}
  ]));
  localStorage.setItem('gastos_deudas_v1','[]');
  openEditModal('rv','credito');
  const visible=document.getElementById('edit-ciclo-section').style.display!=='none';
  const off0=getC().find(t=>t.id==='rv').cycleOffset||0;
  editAplazar(1); const off1=getC().find(t=>t.id==='rv').cycleOffset||0;
  editAplazar(1); const off2=getC().find(t=>t.id==='rv').cycleOffset||0;
  editAplazar(-1); const off1b=getC().find(t=>t.id==='rv').cycleOffset||0;
  closeEditModal();
  return JSON.stringify({pass: visible && off0===0 && off1===1 && off2===2 && off1b===1, visible, off0, off1, off2, off1b});
})()
'@

Check 'EDIT-APLAZAR-MUEVE-COMPRA-Y-DEUDA' @'
(function(){
  const f='2026-05-21T04:00:00.000Z';
  localStorage.setItem('gastos_credito_v2', JSON.stringify([
    {id:'rv2',cardId:'bci',amount:50376,desc:'Regalo',cuotas:3,currency:'CLP',date:f,splitWith:'Tamarindo',splitTotal:100752}
  ]));
  localStorage.setItem('gastos_deudas_v1', JSON.stringify([
    {id:'d',person:'Tamarindo',txId:'rv2',desc:'Regalo',type:'credito',totalAmount:100752,cuotas:3,deudaPerCuota:16792,deudaTotal:50376,currency:'CLP',date:f,paid:false}
  ]));
  openEditModal('rv2','credito');
  editAplazar(1);
  const txOff=getC().find(t=>t.id==='rv2').cycleOffset;
  const dOff=getDeudas().find(x=>x.id==='d').cycleOffset;
  closeEditModal();
  return JSON.stringify({pass: txOff===1 && dOff===1, txOff, dOff});
})()
'@

Check 'EDIT-CICLO-OCULTO-EN-DEBITO' @'
(function(){
  localStorage.setItem('gastos_debito_v2', JSON.stringify([{id:'db',bank:'bci',amount:10000,desc:'X',currency:'CLP',date:new Date().toISOString()}]));
  openEditModal('db','debito');
  const hidden=document.getElementById('edit-ciclo-section').style.display==='none';
  closeEditModal();
  return JSON.stringify({pass:hidden});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
