# Importacion de cobros internacionales en USD (Anthropic/OpenAI y similares).
# Cubre las dos mitades del lado PWA: el parser de correo BCI (parseEmailBCI) y
# el consumo de la cola (syncFromSheets respeta la moneda en vez de forzar CLP).
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot '..\lib\cdp.ps1')
Connect-CDP $Port
Invoke-CDP 'Page.enable' @{} | Out-Null
Invoke-CDP 'Runtime.enable' @{} | Out-Null
Reset-App

# Cuerpo en texto plano equivalente al correo real de BCI de una compra
# internacional (lo que getPlainBody entrega al Apps Script / al Shortcut).
Check 'PARSE-EMAIL-USD-ANTHROPIC' @'
(function(){
  localStorage.setItem('gastos_credito_v2','[]');
  const body="Hola JAVIER ALEJANDRO BAHAMONDEZ GARCES\nRealizaste una compra en comercio internacional con tu tarjeta de credito.\nNumero tarjeta credito ****6146\nMonto USD 23,80\nFecha 20/07/2026\nHora 12:15 horas\nComercio ANTHROPIC* CLAUDE SUB    +14152360599 US";
  const r=window.parseEmailBCI(body);
  const tx=getC()[getC().length-1]||{};
  return JSON.stringify({pass: r==='OK' && tx.currency==='USD' && Math.abs(tx.amount-23.80)<0.001 && (tx.desc||'').indexOf('ANTHROPIC')===0, currency:tx.currency, amount:tx.amount, desc:tx.desc});
})()
'@

Check 'PARSE-EMAIL-CLP-NACIONAL' @'
(function(){
  localStorage.setItem('gastos_credito_v2','[]');
  const body="Realizaste una compra con tu tarjeta de credito.\nMonto $23.800\nComercio JUMBO MAIPU\nCuotas 3";
  const r=window.parseEmailBCI(body);
  const tx=getC()[getC().length-1]||{};
  return JSON.stringify({pass: r==='OK' && tx.currency==='CLP' && tx.amount===23800 && tx.cuotas===3, currency:tx.currency, amount:tx.amount, cuotas:tx.cuotas});
})()
'@

Check 'PARSE-EMAIL-USD-MONTO-GRANDE' @'
(function(){
  // USD con separador de miles chileno: "USD 1.234,56" -> 1234.56
  localStorage.setItem('gastos_credito_v2','[]');
  const body="compra en comercio internacional\nMonto USD 1.234,56\nComercio OPENAI *CHATGPT SUBSCR";
  window.parseEmailBCI(body);
  const tx=getC()[getC().length-1]||{};
  return JSON.stringify({pass: tx.currency==='USD' && Math.abs(tx.amount-1234.56)<0.001, amount:tx.amount, currency:tx.currency});
})()
'@

Check 'SYNCFROMSHEETS-RESPETA-USD' @'
(async function(){
  localStorage.setItem('gastos_credito_v2','[]');
  localStorage.setItem('gastos_debito_v2','[]');
  localStorage.removeItem('misgastos_sync_last');
  const realFetch=window.fetch;
  window.fetch=function(url,opts){
    if(String(url).indexOf('getPending')>=0) return Promise.resolve({ok:true,text:()=>Promise.resolve(JSON.stringify({rows:[
      ['imp_usd_1','bci','credito',23.8,'ANTHROPIC* CLAUDE SUB',1,'USD','2026-07-20T16:15:00.000Z'],
      ['imp_clp_1','bci','credito',23800,'JUMBO',3,'CLP','2026-07-18T12:00:00.000Z'],
      ['imp_empty_1','bci','debito',5000,'FARMACIA',1,'','2026-07-19T12:00:00.000Z']
    ]}))});
    return Promise.resolve({ok:true,text:()=>Promise.resolve('{}')}); // markDone
  };
  await syncFromSheets();
  window.fetch=realFetch;
  _splitQueue=[]; _splitImportMode=false;
  const usd=getC().find(t=>t.id==='imp_usd_1')||{};
  const clp=getC().find(t=>t.id==='imp_clp_1')||{};
  const emp=getD().find(t=>t.id==='imp_empty_1')||{};
  return JSON.stringify({
    pass: usd.currency==='USD' && Math.abs(usd.amount-23.8)<0.001 && usd.cardId==='bci'
       && clp.currency==='CLP' && clp.amount===23800
       && emp.currency==='CLP' && emp.amount===5000,
    usd:{cur:usd.currency,amt:usd.amount}, clp:{cur:clp.currency}, emp:{cur:emp.currency}
  });
})()
'@

Check 'CERO-ERRORES-JS' 'JSON.stringify({pass:(window.__errs||[]).length===0, errs:window.__errs})'
Close-CDP
exit $global:CDP_FAILS
