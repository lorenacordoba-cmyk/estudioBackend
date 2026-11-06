# Backend — Formulario web + especialista Groq + correo SMTP

Esta versión **no ofrece asistente conversacional**. Las antiguas rutas `/api/ai/session`, `/api/ai/chat`, `/api/ai/session/:sessionId` ya no están registradas. También se eliminaron prompts, skills, esquemas, sesiones y motores de entrevista.

## Flujo activo

1. `POST /api/contact/`: valida el formulario y Turnstile cuando corresponde.
2. Envía la consulta original al estudio por SMTP y una confirmación **administrativa** al cliente.
3. Tras la respuesta HTTP 201, ejecuta una evaluación mediante Groq (`legal-specialist.service.js`) y las instrucciones de `src/prompts/lawyer-skills/` según el área seleccionada.
4. Envía un **segundo correo** al estudio con el informe. El sistema no envía nombre, teléfono ni email a Groq.

La evaluación es posterior y sus reintentos viven en memoria; pueden perderse si el servidor se detiene antes de terminar. El correo inicial se entrega primero y no depende de Groq.

## Configuración y ejecución

- Instalar: `npm ci`.
- **Desarrollo local:** `.env.defaults` contiene valores públicos y `npm run dev` inicia en modo `development` con recarga automática. También está `npm run start:local` sin watch.
- **Credenciales locales:** copiar `.env.example` a `.env` y completar `GROQ_API_KEY`, `SECURITY_HASH_SECRET`, `SMTP_USER`, `SMTP_PASS`, etc. `.env` NO se sube a Git; en desarrollo sus valores prevalecen sobre `.env.defaults`.
- **Producción (Google Cloud Run):** `npm start` / `npm run start:prod` activa `NODE_ENV=production` y carga exclusivamente `.env.production.defaults` (valores públicos). Cloud Run entrega `PORT` y las credenciales por variables de entorno/Secret Manager, que **tienen prioridad** sobre el archivo.
- `TURNSTILE_SECRET_KEY` **no se guarda** en `.env.production.defaults`; es un secreto de Cloud Run vinculado desde Secret Manager. Se necesita además `GROQ_API_KEY`, `SECURITY_HASH_SECRET`, `SMTP_USER` y `SMTP_PASS` en Cloud Run.
- El Dockerfile copia `.env.production.defaults` y utiliza `npm start`; el despliegue por Buildpacks también usa `npm start`.
- `npm run check` verifica sintaxis y `npm test` ejecuta pruebas offline.

Valores de Turnstile y origen en producción: `TURNSTILE_ENABLED=true`, `TURNSTILE_EXPECTED_HOSTNAME=lorenacordobaabogada.com.ar`, `TURNSTILE_CONTACT_ACTION=legal_contact_form`, `FRONTEND_ORIGIN=https://lorenacordobaabogada.com.ar`.

**Nota:** si en Cloud Run existe una variable de entorno con alguno de esos mismos nombres, esa variable tiene prioridad sobre `.env.production.defaults`. Para administrar dichos valores desde el repositorio, eliminá las variables duplicadas de Cloud Run, dejando allí las claves privadas.

## Endpoints

- `GET /api/health`: estado del backend.
- `POST /api/contact/`: envío de formulario.
- `GET /api/ops/dashboard`: métricas (cuando se configuró `OPS_METRICS_TOKEN`).
- `GET /api/ops/metrics`: JSON de métricas, requiere cabecera `x-ops-token`.

El enlace de WhatsApp (`https://wa.me/5491131076843`) está en Angular. **No requiere WhatsApp Business API ni genera llamadas a este backend.**
