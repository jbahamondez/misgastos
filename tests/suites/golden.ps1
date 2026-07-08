# Captura dorada: hash de la salida (HTML/datos) de todas las vistas con un
# fixture rico. NO es una prueba pasa/falla: es una herramienta de diff para
# refactors. Flujo: capturar ANTES del cambio, capturar DESPUES, comparar; si
# el refactor no cambia comportamiento, ambas capturas son identicas.
#
#   powershell -File tests\run.ps1 -Suite golden -Out before.txt   # antes
#   powershell -File tests\run.ps1 -Suite golden -Out after.txt    # despues
#   Compare-Object (gc before.txt) (gc after.txt)                  # debe ser vacio
#
# Los hashes dependen de la fecha de hoy (los ciclos usan new Date()), por eso
# NO se versiona un baseline: las dos capturas deben tomarse el mismo dia.
param([int]$Port = 8000, [string]$Out = '')
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App @'
localStorage.setItem('sueldo_mensual','1500000');
localStorage.setItem('gastos_credito_v2', JSON.stringify([
 {id:'c1',cardId:'bci',amount:60000,desc:'JUMBO COMPRA',cuotas:3,currency:'CLP',date:'2026-05-10T12:00:00.000Z',catId:'super'},
 {id:'c2',cardId:'bchile',amount:120000,desc:'FALABELLA TV',cuotas:12,currency:'CLP',date:'2026-01-25T12:00:00.000Z',catId:'tech'},
 {id:'c3',cardId:'scotia',amount:45000,desc:'COPEC BENCINA',cuotas:1,currency:'CLP',date:'2026-06-25T12:00:00.000Z',catId:'bencina'},
 {id:'c4',cardId:'bci',amount:100,desc:'STEAM GAME',cuotas:1,currency:'USD',date:'2026-06-28T12:00:00.000Z',catId:'entrete'},
 {id:'c5',cardId:'bci',amount:80000,desc:'PRESTAMO AMIGO',cuotas:2,currency:'CLP',date:'2026-06-22T12:00:00.000Z',lent:true,splitWith:'Juan',splitTotal:80000,catId:''},
 {id:'c6',cardId:'bci',amount:30000,desc:'SHEIN ROPA',cuotas:1,currency:'CLP',date:'2026-06-30T12:00:00.000Z',cycleOffset:1,catId:'ropa'},
 {id:'c7',cardId:'bchile',amount:24000,desc:'SUSHI DIVIDIDO',cuotas:1,currency:'CLP',date:'2026-07-02T12:00:00.000Z',splitWith:'Tamarindo',splitTotal:48000,catId:'comida'},
 {id:'c8',cardId:'bci',amount:15000,desc:'CARGO RARO',cuotas:1,currency:'CLP',date:'2026-07-03T12:00:00.000Z',catId:''}
]));
localStorage.setItem('gastos_debito_v2', JSON.stringify([
 {id:'d1',bank:'bci',amount:25000,desc:'LIDER DEBITO',currency:'CLP',date:'2026-07-01T12:00:00.000Z',catId:'super'},
 {id:'d2',bank:'bci',amount:12000,desc:'FARMACIA CRUZ VERDE',currency:'CLP',date:'2026-06-15T12:00:00.000Z',catId:'salud'},
 {id:'d3',bank:'bchile',amount:8000,desc:'UBER TRIP',currency:'CLP',date:'2026-05-05T12:00:00.000Z',catId:''}
]));
localStorage.setItem('gastos_deudas_v1', JSON.stringify([
 {id:'deu1',person:'Tamarindo',txId:'c7',desc:'SUSHI DIVIDIDO',type:'credito',totalAmount:48000,cuotas:1,deudaPerCuota:24000,deudaTotal:24000,currency:'CLP',date:'2026-07-02T12:00:00.000Z',paid:false,paidDate:null},
 {id:'deu2',person:'Juan',txId:'c5',desc:'PRESTAMO AMIGO',type:'credito',totalAmount:80000,cuotas:2,deudaPerCuota:40000,deudaTotal:80000,currency:'CLP',date:'2026-06-22T12:00:00.000Z',paid:false,paidDate:null,paidCuotas:[1]},
 {id:'deu3',person:'Pedro',txId:'dOLD',desc:'VIEJA DEUDA',type:'debito',totalAmount:10000,cuotas:1,deudaPerCuota:10000,deudaTotal:10000,currency:'CLP',date:'2026-04-10T12:00:00.000Z',paid:false,paidDate:null}
]));
'@

Invoke-JS 'window.__h=function(s){let x=0;for(let i=0;i<s.length;i++){x=(x*31+s.charCodeAt(i))|0;}return s.length+":"+x;};"ok"' | Out-Null
$lines = New-Object System.Collections.ArrayList
function Cap($n,$js){ [void]$lines.Add(("[{0}] {1}" -f $n,(Invoke-JS $js))) }

Cap 'HIST' @'
(function(){const out={};['ciclo','mes','mes-ant','todo'].forEach(p=>{activeDateFilter=p;['all','credito','bci'].forEach(f=>{activeFilter=f;renderHistorial();out[p+'/'+f]=document.getElementById('hist-subtitle').textContent+'|'+__h(document.getElementById('hist-list').innerHTML);});});activeDateFilter='ciclo';activeFilter='all';renderHistorial();return JSON.stringify(out);})()
'@
Cap 'ANALISIS' @'
(function(){const out={};['cuotas','compras'].forEach(m=>{_analisisModo=m;['ciclo','mes','mes-ant','todo'].forEach(p=>{_analisisPeriod=p;_analisisTxType='ambos';_analisisCatDetalle=null;renderAnalisis();out[m+'/'+p]=__h(document.getElementById('analisis-content').innerHTML);});['credito','debito'].forEach(t=>{_analisisPeriod='mes';_analisisTxType=t;renderAnalisis();out[m+'/mes/'+t]=__h(document.getElementById('analisis-content').innerHTML);});});_analisisModo='cuotas';_analisisPeriod='mes';_analisisTxType='ambos';_analisisCatDetalle='super';renderAnalisis();out['detalle']=__h(document.getElementById('analisis-content').innerHTML);_analisisCatDetalle=null;return JSON.stringify(out);})()
'@
Cap 'COMPARATIVO' @'
(function(){const out={};['cuotas','compras'].forEach(m=>{_analisisModo=m;_analisisTxType='ambos';out['data/'+m]=JSON.stringify(comparativoMensualData());out['meses/'+m]=JSON.stringify(mesesDisponibles());_analisisComparativo=true;renderAnalisis();out['html/'+m]=__h(document.getElementById('analisis-content').innerHTML);_analisisComparativo=false;});return JSON.stringify(out);})()
'@
Cap 'INFORME' @'
(async function(){const orig=compartirPDF;const out={};compartirPDF=async function(){window.__pdf=JSON.stringify(Array.from(arguments));};_informeDesde='2026-01';_informeHasta='2026-07';_analisisTxType='ambos';for(const m of ['cuotas','compras']){_analisisModo=m;await generarInformePDF();out[m]=__h(window.__pdf)+'|len'+window.__pdf.length;}_analisisTxType='credito';_analisisModo='cuotas';_informeDesde='2026-07';_informeHasta='2026-07';await generarInformePDF();out['jul-credito']=window.__pdf;compartirPDF=orig;_analisisTxType='ambos';return JSON.stringify(out);})()
'@
Cap 'QUEDEBO' @'
(function(){const out={};['cerrado','actual'].forEach(p=>{_queDeboPeriod=p;renderQueDebo();out[p]=__h(document.getElementById('quedebo-content').innerHTML);});return JSON.stringify(out);})()
'@
Cap 'DEUDAS' @'
(function(){const di=deudaInstallments().map(i=>({id:i.d.id,k:i.k,n:i.n,amt:i.amt,idx:i.idx,section:i.section,paid:i.paid}));const out={inst:JSON.stringify(di)};['pendiente','pagado','all'].forEach(f=>{activeDeudasStatusFilter=f;renderDeudas();out['render/'+f]=__h(document.getElementById('deudas-content').innerHTML)+'|'+document.getElementById('deudas-summary-box').textContent.replace(/\s+/g,' ');});activeDeudasStatusFilter='pendiente';return JSON.stringify(out);})()
'@
Cap 'SPLITPREVIEW' @'
(function(){const out={};const scen=[['s1',{amount:90000,cuotas:3,desc:'A',currency:'CLP'},['P1'],false],['s2',{amount:90000,cuotas:3,desc:'B',currency:'CLP'},['P1','P2'],false],['s3',{amount:50000,cuotas:1,desc:'C',currency:'CLP'},['P1'],true],['s4',{amount:50000,cuotas:1,desc:'D',currency:'CLP'},[],true],['s5',{amount:30000,cuotas:1,desc:'E',currency:'CLP',type:'debito'},['P1'],false]];scen.forEach(([name,split,pers,lent])=>{_pendingSplit=split;_splitSelectedPersons=pers;_splitLent=lent;updateSplitPreview();out[name]=document.getElementById('split-preview-box').textContent.replace(/\s+/g,' ')+'||'+document.getElementById('btn-confirm-split').textContent;});_pendingSplit=null;_splitSelectedPersons=[];_splitLent=false;return JSON.stringify(out);})()
'@
Cap 'DASH' @'
(function(){renderDashboard();return JSON.stringify({widget:__h(document.getElementById('dash-main-widget').innerHTML),errs:window.__errs});})()
'@
Close-CDP

if($Out){ $lines | Out-File -Encoding utf8 $Out; Write-Host "Captura escrita en $Out ($($lines.Count) lineas)" }
else { $lines | ForEach-Object { Write-Host $_ } }
