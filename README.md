# Backend — Formulario web + especialista Groq + correo SMTP

Esta versión **no ofrece asistente conversacional**. Las antiguas rutas `/api/ai/session`, `/api/ai/chat`, `/api/ai/session/:sessionId` ya no están registradas. También se eliminaron prompts, skills, esquemas, sesiones y motores de entrevista.

## Flujo activo

1. `POST /api/contact/`: valida el formulario y Turnstile cuando corresponde.
2. Envía la consulta original al estudio por SMTP y una confirmación **administrativa** al cliente.
3. Tras la respuesta HTTP 201, ejecuta una evaluación mediante Groq (`legal-specialist.service.js`) y las instrucciones de `src/prompts/lawyer-skills/` según el área seleccionada.
4. Envía un **segundo correo** al estudio con el informe. El sistema no envía nombre, teléfono ni email a Groq.

La evaluación es posterior y sus reintentos viven en memoria; pueden perderse si el servidor se detiene antes de terminar. El correo inicial se entrega primero y no depende de Groq.

## Configuración y ejecución

- `npm install`
- Copiar `.env.example` a `.env` y configurar Groq, SMTP, `SECURITY_HASH_SECRET` y Turnstile para producción.
- `npm run dev` o `npm start`.
- `npm run check` comprueba sintaxis; `npm test` ejecuta pruebas offline.

## Endpoints

- `GET /api/health`: estado del backend.
- `POST /api/contact/`: envío de formulario.
- `GET /api/ops/dashboard`: métricas (cuando se configuró `OPS_METRICS_TOKEN`).
- `GET /api/ops/metrics`: JSON de métricas, requiere cabecera `x-ops-token`.

El enlace de WhatsApp (`https://wa.me/5491131076843`) está en Angular. **No requiere WhatsApp Business API ni genera llamadas a este backend.**
