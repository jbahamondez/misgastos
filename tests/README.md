# Pruebas headless de MisGastos

Batería de regresión que corre la app real en un navegador headless (Edge o
Chrome) vía Chrome DevTools Protocol, sin frameworks ni dependencias: solo
PowerShell 5.1 (el que trae Windows) y un navegador Chromium instalado.

## Cómo correr

```powershell
# Batería CI (invariantes): smoke, SRI+guard, XSS, lazy-xlsx
powershell -File tests\run.ps1

# Una suite puntual
powershell -File tests\run.ps1 -Suite xss

# Captura dorada para un refactor (ver más abajo)
powershell -File tests\run.ps1 -Suite golden -Out before.txt
```

`run.ps1` levanta un servidor estático apuntando al repo, abre el navegador
headless, corre las suites y limpia todo al terminar. El **exit code es el número
de checks fallidos** (0 = todo verde), así que sirve tal cual para un pipeline.

## Qué hay

| Archivo | Qué verifica |
|---|---|
| `lib/cdp.ps1` | Cliente CDP (WebSocket) + helpers `Invoke-JS`, `Reset-App`, `Check` |
| `lib/serve.ps1` | Servidor estático (raíz = repo, derivada del path del script) |
| `run.ps1` | Orquestador: server + navegador + suites + limpieza |
| `suites/smoke.ps1` | La app arranca y todas las vistas renderizan sin errores JS |
| `suites/sri-guard.ps1` | Los 3 scripts CDN cargan con su hash SRI; guard anti-borrado masivo del sync |
| `suites/xss.ps1` | Payloads maliciosos quedan inertes (se muestran como texto) en toda la app |
| `suites/lazy-xlsx.ps1` | xlsx se carga bajo demanda, no en el arranque |
| `suites/golden.ps1` | Herramienta de diff antes/después de refactors (no es pasa/falla) |

## La captura dorada (`golden`)

Para un refactor que **no debe cambiar comportamiento** (como unificar lógica
duplicada), captura la salida de todas las vistas antes y después y compara:

```powershell
git stash                                             # volver al estado previo
powershell -File tests\run.ps1 -Suite golden -Out before.txt
git stash pop                                         # traer el refactor
powershell -File tests\run.ps1 -Suite golden -Out after.txt
Compare-Object (Get-Content before.txt) (Get-Content after.txt)  # vacío = idéntico
```

Los hashes dependen de la fecha de hoy (los ciclos de facturación se calculan con
`new Date()`), por eso **no** se versiona un baseline fijo: las dos capturas deben
tomarse el mismo día. Por eso `golden` no está en la batería CI.

## Notas

- Requiere Edge o Chrome instalado en una ruta estándar de `Program Files`.
- Cada suite usa un fixture propio en `localStorage` y desactiva el sync de
  correos, así que no toca datos reales ni la nube.
- Escrito para PowerShell 5.1; no requiere PowerShell 7.
