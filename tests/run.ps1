# Orquestador de las pruebas headless de MisGastos.
#
#   powershell -File tests\run.ps1            # corre la bateria CI (invariantes)
#   powershell -File tests\run.ps1 -Suite xss # corre una suite puntual
#   powershell -File tests\run.ps1 -Suite golden -Out before.txt  # captura dorada
#
# Levanta un servidor estatico + Edge headless, corre la(s) suite(s) y limpia.
# Exit code = numero de checks fallidos (0 = todo verde), util para CI.
param(
  [string]$Suite = 'ci',
  [int]$Port = 8000,
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$ci = @('smoke','sri-guard','xss','lazy-xlsx')  # suites de invariantes (fecha-independientes)

# Ubicar el ejecutable de Edge (o Chrome) sin asumir una ruta unica
$browser = @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles (x86)\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if(-not $browser){ Write-Error "No se encontro Edge ni Chrome"; exit 99 }

$profileDir = Join-Path $env:TEMP 'misgastos-test-profile'
$serverProc = $null; $browserProc = $null
try{
  # 1) Servidor estatico
  $serverProc = Start-Process powershell -PassThru -WindowStyle Hidden `
    -ArgumentList '-NoProfile','-File',(Join-Path $here 'lib\serve.ps1'),$Port
  Start-Sleep -Seconds 2

  # 2) Edge/Chrome headless con puerto de depuracion
  $browserProc = Start-Process $browser -PassThru -WindowStyle Hidden -ArgumentList `
    '--headless=new','--remote-debugging-port=9222',"--user-data-dir=$profileDir",`
    '--no-first-run','--no-default-browser-check',"http://localhost:$Port/index.html"
  Start-Sleep -Seconds 6

  # 3) Elegir suites
  $toRun = if($Suite -eq 'ci'){ $ci } elseif($Suite -eq 'all'){ $ci + 'golden' } else { @($Suite) }
  $fails = 0
  foreach($s in $toRun){
    $file = Join-Path $here "suites\$s.ps1"
    if(-not (Test-Path $file)){ Write-Host "SUITE NO ENCONTRADA: $s"; $fails++; continue }
    Write-Host ""; Write-Host "=== $s ==="
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$file,'-Port',$Port)
    if($Out){ $args += @('-Out',$Out) }
    & powershell @args
    $fails += $LASTEXITCODE
  }
  Write-Host ""; Write-Host "TOTAL CHECKS FALLIDOS: $fails"
  exit $fails
}
finally{
  if($browserProc){ try{ Stop-Process -Id $browserProc.Id -Force -ErrorAction SilentlyContinue }catch{} }
  if($serverProc){ try{ Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue }catch{} }
  # Barrido por linea de comando: mata cualquier navegador (por el profile de prueba)
  # o servidor (serve.ps1) que haya quedado, aunque el Start-Process apunte a un launcher.
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*misgastos-test-profile*" } |
    ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }catch{} }
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*lib\serve.ps1*" } |
    ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }catch{} }
}
