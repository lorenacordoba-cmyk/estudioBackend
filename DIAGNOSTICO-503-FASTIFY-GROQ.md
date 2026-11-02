# Diagnóstico del HTTP 503 en Fastify + Groq

## Qué revelan los logs del usuario

- `OPTIONS 204`: CORS correcto.
- `GET /api/ai/session/:sessionId 401`: sesión previa inválida (normal si el servidor reinició y se usa memoria local).
- `POST /api/ai/session 201`: sesión nueva creada.
- `POST /api/ai/chat 503`: fallo tras recibir la petición.

El aviso `disableRequestLogging` era una deprecación independiente, no la causa del 503.

## Cambios

1. Configuración `logController: new LogController({disableRequestLogging:true})` conforme a Fastify actual.
2. Logs por etapa de chat (`prompt_guard` y `triage`) con metadatos mínimos; no registran cuerpo de los mensajes.
3. Los errores indican `pipelineStage` y, si corresponde, `guardDiagnostic` en desarrollo. El parseo de etiquetas admite JSON y `Label:` si Groq los devuelve, manteniendo *fail closed* ante respuestas desconocidas.
4. Script `node scripts/diagnosticar-groq.mjs`: para el texto ficticio de prueba ahora imprime la etiqueta real y `finish_reason` de Prompt Guard. No comparte tokens de la API.

## Cómo probar

```powershell
cd backend
npm install
# Conservar .env previo
npm run dev
```

Abrir Chrome F12 > Network > POST `/api/ai/chat` > Response. La respuesta de error indica `code`, `pipelineStage` y potencialmente `guardDiagnostic`. Revisar también el log `CHAT etapa fallida`.

Para aislar Groq sin enviar datos reales:

```powershell
node scripts/diagnosticar-groq.mjs
```

Si aparece `pipelineStage=prompt_guard` y `code=PROMPT_GUARD_UNAVAILABLE`, comparar la etiqueta impresa por el script con las etiquetas esperadas `benign`/`malicious`. Si aparece `pipelineStage=triage`, compartir `upstreamStatus`, `upstreamIssue` y `upstreamParameter`.

Deshabilitar `GROQ_GUARD_ENABLED=false` únicamente como prueba local temporal, no en producción. No agregar mensajes completos, tokens, claves ni cabeceras privadas a logs.

### Limitaciones

No es posible determinar la causa definitiva del 503 solo con el código HTTP y los registros de inicio/fin de la ruta. Estos cambios permiten identificarla sin adivinar.
