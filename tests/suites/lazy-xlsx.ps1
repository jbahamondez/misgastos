# xlsx (SheetJS) se carga bajo demanda, no en el arranque.
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App

Check 'XLSX-NO-EN-ARRANQUE' @'
(function(){
  const enDom=[...document.querySelectorAll('script')].some(s=>s.src.includes('xlsx'));
  return JSON.stringify({pass: typeof XLSX==='undefined' && !enDom, xlsxDef: typeof XLSX!=='undefined', enDom});
})()
'@

Check 'HTML-SIN-SCRIPT-XLSX' @'
(async function(){
  const html=await (await fetch('./index.html')).text();
  const tieneTag=/<script[^>]*xlsx\.full\.min\.js/.test(html);
  const loader=(await (await fetch('./app.js')).text()).includes('function loadXLSX');
  return JSON.stringify({pass: !tieneTag && loader, tieneTag, loader});
})()
'@

Check 'LOADXLSX-IDEMPOTENTE' @'
(async function(){
  await loadXLSX(); await loadXLSX();
  const n=[...document.querySelectorAll('script')].filter(s=>s.src.includes('xlsx')).length;
  return JSON.stringify({pass: typeof XLSX!=='undefined' && n===1, n});
})()
'@

Check 'PARSE-CARTOLA-REAL' @'
(async function(){
  await loadXLSX();
  const aoa=[['Fecha','Descripcion','Monto'],['05/07/2026','JUMBO TEST',12345],['06/07/2026','COPEC TEST',6789]];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'H1');
  const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const rows=XLSX.utils.sheet_to_json(XLSX.read(buf,{type:'array'}).Sheets['H1'],{header:1,raw:true,defval:''});
  const parsed=parseCartola(rows,'bci');
  return JSON.stringify({pass: parsed.length===2 && parsed.some(p=>p.desc.includes('JUMBO')), n:parsed.length});
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
