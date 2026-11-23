# MisGastos — Backend de ingreso automático (Vercel)

Función serverless que recibe las notificaciones del banco (desde el atajo de
iOS) y las registra en la cuenta del usuario en Firestore, en tiempo real.

Reemplaza al Apps Script + la Cola: el gasto entra solo, sin pasos manuales.

---

## Puesta en marcha (una sola vez)

### 1. Credenciales de Firebase (service account)
1. [Firebase Console](https://console.firebase.google.com/) → proyecto
   **mis-gastos-81f60** → ⚙️ **Configuración del proyecto** → pestaña
   **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** → descarga un archivo `.json`.
3. De ese archivo necesitarás tres valores:
   - `project_id`
   - `client_email`
   - `private_key` (el texto largo que empieza con `-----BEGIN PRIVATE KEY-----`)

> ⚠️ Ese archivo es secreto. No lo subas al repo ni lo compartas.

### 2. Crear el proyecto en Vercel
1. Crea cuenta gratis en [vercel.com](https://vercel.com) (puedes entrar con GitHub).
2. **Add New… → Project** → importa tu repo **misgastos**.
3. En la configuración del proyecto, pon **Root Directory = `vercel-api`**.
4. Framework preset: **Other** (no toques build/output; Vercel detecta `/api`).

### 3. Variables de entorno (en Vercel)
En el proyecto → **Settings → Environment Variables**, agrega tres:

| Nombre | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | el `project_id` del JSON |
| `FIREBASE_CLIENT_EMAIL` | el `client_email` del JSON |
| `FIREBASE_PRIVATE_KEY` | el `private_key` **completo**, con comillas incluidas tal cual del JSON (los `\n` se mantienen) |

> Para `FIREBASE_PRIVATE_KEY`: copia el valor tal como está en el JSON, con los
> `\n` adentro. El código los convierte a saltos de línea reales.

### 4. Desplegar
**Deploy**. Al terminar, Vercel te da una URL tipo:
`https://misgastos-ingest.vercel.app`

Tu endpoint será: `https://misgastos-ingest.vercel.app/api/ingest`

---

## Probar que funciona

Necesitas un **token** válido (mapea un token → tu usuario). Dos formas:

- **Desde la PWA** (recomendado): Ajustes → *Ingreso automático* → genera tu
  token y copia la URL del atajo. *(Esta pantalla se agrega en el paso siguiente
  del proyecto.)*
- **Manual (para probar ahora):** en Firestore → colección **`ingest_tokens`** →
  crea un documento con **ID = un texto aleatorio** (tu token) y un campo
  `uid` = tu UID de usuario (lo ves en Authentication → Users).

Luego, una prueba con `curl`:

```bash
curl -s -L -X POST "https://TU-PROYECTO.vercel.app/api/ingest" \
  --data-urlencode "token=TU_TOKEN" \
  --data-urlencode "texto=Banco Santander Chile
SHELL
\$12.345"
```

Respuesta esperada: `{"ok":true,"amount":12345,"desc":"SHELL","cardId":"santander"}`
y el gasto aparece en tu app en segundos.

---

## El atajo de iOS (igual que el de Santander, pero apuntando aquí)
En "Obtener contenido de URL":
- URL: `https://TU-PROYECTO.vercel.app/api/ingest`
- Método: **POST**, Cuerpo: **Formulario**
- Campo `token` = tu token
- Campo `texto` = la variable **🔔 Notificación**
- (Deja el paso **Esperar 3 segundos** al final, como ya lo tienes.)

---

## Notas
- El banco se detecta del texto y se calza con la tarjeta de crédito del usuario
  cuyo nombre coincida; si no calza, usa la primera tarjeta de crédito.
- Anti-duplicado: descarta una segunda notificación del mismo monto/tarjeta
  dentro de 60 segundos.
- Firestore Admin ignora las reglas de seguridad (por diseño), por eso el backend
  puede escribir en la cuenta correcta.
