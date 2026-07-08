# Cliente Chrome DevTools Protocol (CDP) sobre WebSocket para PowerShell 5.1.
# Se conecta a un Edge/Chrome lanzado con --remote-debugging-port=9222 y permite
# evaluar JS en la pagina de la app (http://localhost:8000). Sin dependencias.
$script:cdpId = 0
$script:ws = $null
$script:ct = [Threading.CancellationToken]::None
$global:CDP_FAILS = 0

function Connect-CDP($Port = 8000, $DebugPort = 9222){
  $targets = Invoke-RestMethod -Uri "http://localhost:$DebugPort/json" -TimeoutSec 5
  $page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like "http://localhost:$Port*" } | Select-Object -First 1
  if(-not $page){ throw "No se encontro la pagina de la app en localhost:$Port" }
  $script:ws = New-Object System.Net.WebSockets.ClientWebSocket
  $script:ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
  $script:ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $script:ct).Wait()
  Write-Host "CDP conectado: $($page.url)"
}

function Send-CDPRaw($obj){
  $msg = $obj | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $seg = New-Object 'ArraySegment[byte]' -ArgumentList @(,$bytes)
  $script:ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $script:ct).Wait()
}

function Receive-CDPMessage {
  $buffer = New-Object byte[] 1048576
  $seg = New-Object 'ArraySegment[byte]' -ArgumentList @(,$buffer)
  $sb = New-Object Text.StringBuilder
  do {
    $res = $script:ws.ReceiveAsync($seg, $script:ct).Result
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $res.Count))
  } while(-not $res.EndOfMessage)
  $sb.ToString()
}

function Invoke-CDP($method, $params){
  $script:cdpId++
  $id = $script:cdpId
  if($null -eq $params){ $params = @{} }
  Send-CDPRaw @{id=$id; method=$method; params=$params}
  for($i=0; $i -lt 200; $i++){
    $raw = Receive-CDPMessage
    $msg = $raw | ConvertFrom-Json
    if($msg.id -eq $id){ return $msg }
  }
  throw "Sin respuesta para $method (id $id)"
}

function Invoke-JS($js){
  $resp = Invoke-CDP 'Runtime.evaluate' @{expression=$js; returnByValue=$true; awaitPromise=$true}
  if($resp.result.exceptionDetails){
    return "JS-ERROR: " + ($resp.result.exceptionDetails.exception.description)
  }
  return $resp.result.result.value
}

# Prepara la pagina: desactiva el sync automatico de correos (adelanta el timestamp)
# e instala un capturador de errores JS. Recarga y espera a que la app arranque.
function Reset-App($fixtureJs = ''){
  $boot = "localStorage.clear(); localStorage.setItem('misgastos_sync_last', String(Date.now()+9e9)); window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(String(e.message||e))); $fixtureJs"
  Invoke-CDP 'Page.addScriptToEvaluateOnNewDocument' @{source=$boot} | Out-Null
  Invoke-JS 'location.reload();"r"' | Out-Null
  Start-Sleep -Seconds 5
}

# Evalua un check que debe devolver JSON con {"pass":true|false,...}. Imprime el
# resultado y cuenta las fallas en $global:CDP_FAILS (lo usa run.ps1 para el exit code).
function Check($name, $js){
  $r = Invoke-JS $js
  Write-Host ("[{0}] {1}" -f $name, $r)
  if($r -is [string] -and ($r -like '*"pass":false*' -or $r -like 'JS-ERROR*')){ $global:CDP_FAILS++ }
}

function Close-CDP {
  if($script:ws){ try{ $script:ws.Dispose() }catch{} }
}
