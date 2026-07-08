# Servidor estatico minimo para servir la app durante las pruebas.
# La raiz es el repo (dos niveles arriba de este script), no una ruta fija:
# funciona en cualquier maquina/checkout. Uso: powershell -File serve.ps1 [puerto]
param([int]$Port = 8000)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Sirviendo $root en http://localhost:$Port/"
$map = @{'.html'='text/html; charset=utf-8';'.js'='application/javascript';'.json'='application/json';'.png'='image/png';'.css'='text/css';'.svg'='image/svg+xml'}
while($listener.IsListening){
  try{
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if([string]::IsNullOrEmpty($path)){ $path = 'index.html' }
    $file = Join-Path $root $path
    if(Test-Path $file -PathType Leaf){
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      if($map.ContainsKey($ext)){ $ctx.Response.ContentType = $map[$ext] }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
  }catch{}
}
