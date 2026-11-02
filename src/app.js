import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { contactRoutes } from './routes/contact.routes.js';
import { opsRoutes } from './routes/ops.routes.js';
import { observability } from './services/observability.service.js';
import { usageService } from './services/usage.service.js';
import { groq } from './config/groq.js';
import { formReviewDeliveryService } from './services/form-review-delivery.service.js';

// Fastify es CommonJS; su exportación por defecto expone LogController.
const { LogController } = Fastify;

/** Constructor exportado para pruebas de integración con fastify.inject(). */
export async function buildApp() {
  const app = Fastify({
    // Logs técnicos, sin cuerpo de solicitudes, consultas jurídicas ni cabeceras privadas.
    // Los logs automáticos de Fastify se reemplazan por mensajes mínimos en los hooks.
    logger: env.NODE_ENV === 'test' ? false : {
      level: env.LOG_LEVEL,
      serializers: {
        req: request => ({ method: request.method }),
        res: reply => ({ statusCode: reply.statusCode })
      },
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-session-token',
        'headers.authorization',
        'headers.cookie',
        'headers.x-session-token'
      ]
    },
    // Configuración compatible con Fastify 5 reciente y futuro Fastify 6.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 32 * 1024,
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
    genReqId: () => randomUUID()
  });
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin(origin, callback) {
      const allowed = env.FRONTEND_ORIGIN.split(',').map(x => x.trim()).filter(Boolean);
      callback(null, !origin || allowed.includes(origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 86400
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    request.log.info({
      requestId: request.id,
      method: request.method,
      route: request.routeOptions?.url || '(ruta desconocida)'
    }, 'HTTP entrada');
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url || '(ruta desconocida)';
    if (reply.statusCode >= 500) observability.increment('server_errors');
    request.log.info({ requestId: request.id, method: request.method, route, statusCode: reply.statusCode }, 'HTTP respuesta');
  });
  app.get('/api/health', async () => ({
    ok: true,
    service: 'estudio-juridico-ai-fastify-groq',
    provider: 'groq',
    model: env.GROQ_LEGAL_REVIEW_MODEL,
    intakeChannel: 'web-form-and-whatsapp',
    persistence: 'memory-only',
    usage: env.NODE_ENV === 'production' ? undefined : usageService.snapshot(),
    groqRateGate: env.NODE_ENV === 'production' ? undefined : groq.rateGate?.snapshot()
  }));
  // Registrar handler ANTES de las rutas: herencia fiable en plugins Fastify.
  app.setErrorHandler((error, request, reply) => {
    // Registrar SOLO metadatos técnicos, sin la consulta, transcripción,
    // credenciales ni contenido de la respuesta de Groq.
    const upstreamLog = {
      requestId: request.id,
      route: request.routeOptions?.url || '(sin ruta)',
      code: error?.code || 'INTERNAL_ERROR',
      status: error?.status || error?.statusCode || 500,
      upstreamStatus: error?.upstreamStatus || null,
      upstreamCode: error?.upstreamCode || null,
      upstreamIssue: error?.upstreamIssue || null,
      upstreamParameter: error?.upstreamParameter || null,
      validationPath: error?.validationPath || null,
      pipelineStage: error?.pipelineStage || null,
        estimatedTokens: error?.estimatedTokens || null,
      configuredTpm: error?.configuredTpm || null
    };
    if (upstreamLog.status >= 500) request.log.error(upstreamLog, 'API_ERROR');
    else request.log.warn(upstreamLog, 'API_ERROR');
    const allowedStatuses = new Set([400, 401, 403, 409, 413, 429, 502, 503]);
    const rawStatus = error?.status || error?.statusCode;
    const status = allowedStatuses.has(rawStatus) ? rawStatus : 500;
    if (error?.retryAfterSeconds) reply.header('Retry-After', String(error.retryAfterSeconds));
    const publicMessage = {
      400: 'La solicitud no es válida.',
      403: 'No se pudo completar la verificación de seguridad.',
      409: 'Ya hay un mensaje en proceso. Esperá a que termine antes de enviar otro.',
      413: error?.code === 'GROQ_REQUEST_TOO_LARGE'
        ? 'La consulta supera el presupuesto de contexto del especialista. No es un límite de frecuencia de Groq.'
        : 'La solicitud supera el tamaño máximo permitido.',
      429: error?.code === 'GROQ_RATE_LIMIT'
        ? 'Groq alcanzó temporalmente su cuota de solicitudes o tokens. Reintentá cuando se restablezca.'
        : ['GROQ_LOCAL_RATE_LIMIT', 'GROQ_QUEUE_FULL'].includes(error?.code)
          ? 'El especialista está procesando otras consultas. Volvé a intentarlo en unos segundos.'
          : 'Se alcanzó temporalmente un límite de seguridad. Intentá más tarde.',
      502: error?.code === 'GROQ_INVALID_STRUCTURED_OUTPUT'
        ? 'No pudimos interpretar correctamente la respuesta de la IA. Reintentá el mensaje.'
        : 'El proveedor de IA rechazó la solicitud. Verificá la configuración del servidor.',
      503: 'El servicio no está disponible temporalmente. Reintentá más tarde.'
    }[status] || 'No fue posible procesar la consulta en este momento.';
    return reply.code(status).send({
      error: publicMessage, code: error?.code || 'INTERNAL_ERROR', requestId: request.id,
      // Tiempo de espera no sensible; la interfaz puede informar cuánto esperar.
      ...(error?.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      ...(env.NODE_ENV === 'production' ? {} : {
        detail: error?.message,
        ...(error?.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        ...(error?.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
        ...(error?.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
        ...(error?.upstreamIssue ? { upstreamIssue: error.upstreamIssue } : {}),
        ...(error?.upstreamParameter ? { upstreamParameter: error.upstreamParameter } : {}),
        ...(error?.validationPath ? { validationPath: error.validationPath } : {}),
        ...(error?.pipelineStage ? { pipelineStage: error.pipelineStage } : {}),
      })
    });
  });
  await app.register(contactRoutes, { prefix: '/api/contact' });
  await app.register(opsRoutes, { prefix: '/api/ops' });
  app.addHook('onClose', async () => {
    await formReviewDeliveryService.drain();
    formReviewDeliveryService.shutdown();
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Ruta no encontrada.' }));
  return app;
}
