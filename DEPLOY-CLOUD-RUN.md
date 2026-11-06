# Backend Fastify — Google Cloud Run y GitHub

## Selección de ambientes

| Comando | Entorno | Defaults cargados | Credenciales privadas |
| --- | --- | --- | --- |
| `npm run dev` | development, watch | `.env.defaults` | `.env` local, opcional |
| `npm run start:local` | development | `.env.defaults` | `.env` local, opcional |
| `npm start` / `npm run start:prod` | production | `.env.production.defaults` | variables de Cloud Run/Secret Manager |

`package.json` usa `scripts/start.mjs` para seleccionar NODE_ENV, compatible con Windows y Linux. El archivo `src/config/env.js` no carga `.env` cuando NODE_ENV es production. Las variables definidas por Cloud Run siempre tienen prioridad sobre los defaults versionados.

## Configuración que queda versionada para producción

En `.env.production.defaults`:

```
NODE_ENV=production
PORT=8080
TURNSTILE_ENABLED=true
TURNSTILE_EXPECTED_HOSTNAME=lorenacordobaabogada.com.ar
TURNSTILE_CONTACT_ACTION=legal_contact_form
FRONTEND_ORIGIN=https://lorenacordobaabogada.com.ar
```

También se conservan los demás parámetros públicos que estaban en `.env.defaults`. **No se incluyen credenciales privadas**.

## Variables privadas de Cloud Run

- `TURNSTILE_SECRET_KEY`: vinculada a Google Secret Manager, como ya configuraste.
- `GROQ_API_KEY`, `SECURITY_HASH_SECRET` (al menos 24 caracteres), `SMTP_USER`, `SMTP_PASS`: deben seguir definidas en Cloud Run/Secret Manager.
- Opcionalmente `STUDY_EMAIL` si querés sobrescribir el valor definido por el backend.

**Evitar duplicados:** si Cloud Run tiene variables como `TURNSTILE_ENABLED`, `FRONTEND_ORIGIN` o `TURNSTILE_EXPECTED_HOSTNAME` con valores antiguos, sobrescribirán a `.env.production.defaults`. Si querés administrar esos parámetros desde GitHub, quitá esas variables normales del servicio; conservá las claves privadas.

## Compilación y despliegue

- Repositorio GitHub con `package.json`, `package-lock.json`, `.env.production.defaults`, `src/` y `scripts/` directamente en la raíz.
- **Cloud Buildpacks (configuración actual):** mantené el activador si ya construye y publica. El `npm start` actualizado carga producción; no hace falta cambiar el tipo de compilación para cargar estos defaults.
- **Dockerfile (alternativa ya preparada):** instala con `npm ci --omit=dev`, copia `.env.production.defaults`, y ejecuta `npm start`. Cambiar Cloud Build a Dockerfile puede requerir pasos adicionales para desplegar la imagen en Cloud Run; no cambies el activador existente solo por esta modificación.
- Servicio Cloud Run: `estudio-juridico-api`, región `southamerica-east1`, puerto `8080` (Cloud Run inyecta `PORT`), acceso público según el diseño de tu API.
- La aplicación escucha en `0.0.0.0` y respeta `process.env.PORT`.

## Verificación

1. `npm run check`: control de sintaxis.
2. Hacer push a `main`; comprobar que Cloud Build termina y la revisión está activa.
3. Consultar `GET https://<tu-servicio-run-app>/api/health` y verificar `ok: true`.
4. Si la revisión no inicia, mirar los **logs del contenedor** para identificar la variable faltante.

## Limitación funcional que no se modificó

La evaluación Groq y el segundo email al estudio se ejecutan después de responder HTTP 201, con cola en memoria. En Cloud Run la tarea podría interrumpirse por escalado a cero o reinicios. Resolverlo requiere otra decisión de arquitectura; no se alteró en este cambio.

No enviar la Secret Key ni valores de `.env` en capturas. Si alguna clave privada fue versionada previamente en GitHub, conviene rotarla.
