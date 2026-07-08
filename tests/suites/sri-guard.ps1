# SRI + guard anti-borrado masivo.
# #6: los 3 scripts CDN cargan con su hash (si no calzara, no cargarian).
# #3: un sync que borraria >50% de una coleccion grande se aborta; allowBulk pasa.
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App

Check 'SRI-XLSX-CARGA' @'
(async function(){ await loadXLSX(); return JSON.stringify({pass: typeof XLSX!=="undefined" && typeof XLSX.read==="function"}); })()
'@
Check 'SRI-JSPDF-CARGA' @'
(async function(){ await loadJsPDF(); return JSON.stringify({pass: !!(window.jspdf&&window.jspdf.jsPDF)}); })()
'@
Check 'SRI-PDFJS-CARGA' @'
(async function(){ await loadPdfJs(); return JSON.stringify({pass: !!window.pdfjsLib && typeof pdfjsLib.getDocument==="function"}); })()
'@

Check 'GUARD-BLOQUEA-CORRUPTO' @'
(function(){
  let sets=0, dels=0;
  window._fb={syncEnabled:true, pendingOps:0, cache:{}, cloudSet:()=>sets++, cloudDelete:()=>dels++};
  const m=new Map(); for(let i=1;i<=10;i++) m.set('c'+i,{id:'c'+i,amount:1000});
  window._fb.cache['transactions_credit']=m;
  saveC([{id:'c1',amount:1000,desc:'x',cuotas:1,currency:'CLP',date:new Date().toISOString()}]);
  return JSON.stringify({pass: sets===0 && dels===0 && window._fb.cache['transactions_credit'].size===10, sets, dels});
})()
'@
Check 'GUARD-ALLOWBULK-BORRA' @'
(function(){
  let dels=0;
  window._fb={syncEnabled:true, pendingOps:0, cache:{}, cloudSet:()=>0, cloudDelete:()=>dels++};
  const m=new Map(); for(let i=1;i<=10;i++) m.set('c'+i,{id:'c'+i,amount:1000});
  window._fb.cache['transactions_credit']=m;
  saveC([],{allowBulk:true});
  return JSON.stringify({pass: dels===10, dels});
})()
'@
Check 'GUARD-CONFIG-NO-PROTEGIDA' @'
(function(){
  let dels=0;
  window._fb={syncEnabled:true, pendingOps:0, cache:{}, cloudSet:()=>0, cloudDelete:()=>dels++};
  const m=new Map(); for(let i=1;i<=6;i++) m.set('cat'+i,{id:'cat'+i,name:'n'+i});
  window._fb.cache['categories']=m;
  saveCategorias([{id:'cat1',name:'n1',emoji:'x',color:'#fff'},{id:'cat2',name:'n2',emoji:'x',color:'#fff'}]);
  return JSON.stringify({pass: dels===4, dels});
})()
'@
Check 'GUARD-BORRADO-NORMAL' @'
(function(){
  let dels=0;
  window._fb={syncEnabled:true, pendingOps:0, cache:{}, cloudSet:()=>0, cloudDelete:()=>dels++};
  const arr=[]; const m=new Map();
  for(let i=1;i<=10;i++){ const t={id:'c'+i,amount:1000,desc:'x',cuotas:1,currency:'CLP',date:new Date().toISOString()}; arr.push(t); m.set('c'+i,t); }
  window._fb.cache['transactions_credit']=m;
  saveC(arr.filter(t=>t.id!=='c5'));
  return JSON.stringify({pass: dels===1, dels});
})()
'@
Invoke-JS 'delete window._fb;"ok"' | Out-Null
Close-CDP
exit $global:CDP_FAILS
