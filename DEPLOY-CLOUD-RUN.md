# Publicación de Fastify en Google Cloud Run (GitHub + Cloud Build)

## Cambios realizados
- `Dockerfile`: copia `.env.defaults`, usa instalación reproducible `npm ci --omit=dev`, expone el puerto 8080 y conserva `npm start`.
- `.dockerignore`: evita incluir `.env` y `.git` en la imagen.
- No se alteraron rutas, seguridad, lógica de correos ni integración Groq.

## Configuración del repositorio
La raíz del repositorio GitHub debe contener `Dockerfile`, `package.json`, `package-lock.json`, `.env.defaults` y `src/`.

En Cloud Run > servicio `estudio-juridico-api` > Configuración de despliegue continuo / Cloud Build:
- Branch: `^main$`
- Tipo de compilación: **Dockerfile**, NO Buildpacks.
- Dockerfile location: `Dockerfile` (raíz del repositorio).
- Build context: raíz del repositorio (si el código está en subcarpeta, seleccionar esa subcarpeta).
- En cada push a `main`, verificar los registros del build y la revisión creada.

## Cloud Run
- Región seleccionada: `southamerica-east1` (São Paulo).
- Puerto del contenedor: `8080`. Cloud Run inyecta `PORT=8080` en ejecución y la aplicación lo respeta (`src/config/env.js`, `src/server.js`).
- Acceso público HTTPS para Angular; CORS debe permitir SOLO la URL real del frontend.
- Instancias mínimas: 0. Instancias máximas: configurar según necesidades y límites de costos.
- Cuenta de servicio: `estudio-juridico-api` (permisos mínimos).

## Variables de entorno / Secret Manager
**Obligatorias:** `GROQ_API_KEY`, `SECURITY_HASH_SECRET` (mínimo 24 caracteres), `SMTP_USER`, `SMTP_PASS`, `TURNSTILE_SECRET_KEY`.
**Producción:** `NODE_ENV=production`, `TURNSTILE_ENABLED=true`, `TURNSTILE_EXPECTED_HOSTNAME` (hostname exacto sin protocolo), `FRONTEND_ORIGIN` (origen HTTPS exacto, con esquema), `STUDY_EMAIL` (email real del estudio).
**Brevo:** `.env.defaults` incluye `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587` y `SMTP_FROM`; confirmar `SMTP_SECURE=false` para STARTTLS por puerto 587, porque el esquema utiliza false por defecto.

El orden es: variables inyectadas por Cloud Run > `.env.defaults` (dotenv NO sobreescribe el entorno existente). No subir `.env` a GitHub.

## Verificación
- `npm run check` para sintaxis en una máquina con Node 22.
- Después de publicar: `GET https://URL-REAL-DEL-SERVICIO/api/health` debe responder HTTP 200 JSON con `ok: true`.
- Si la compilación o revisión falla, consultar `Cloud Run > servicio > Historial de compilaciones` y `Registros` de la revisión fallida. No es posible conocer el error exacto desde una captura general de revisiones.

## Advertencia funcional preexistente (sin modificar)
El código encola el análisis con Groq y un segundo email **después de responder HTTP 201**, usando una cola en memoria. En Cloud Run con facturación por solicitud, esas tareas podrían suspenderse o perderse durante escalado/reinicios. Para garantizar la entrega se requeriría una decisión de arquitectura (trabajo síncrono, Cloud Tasks, u otra cola persistente). No se modificó este comportamiento.

## Seguridad
No enviar claves privadas ni contenidos de `.env` en capturas. Las credenciales que se hayan subido alguna vez a Git deben rotarse, aun si luego se eliminan del repositorio.
