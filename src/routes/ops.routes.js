import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { dashboardHtml, dashboardJs } from './ops-dashboard.js';
import { observability } from '../services/observability.service.js';
import { usageService } from '../services/usage.service.js';
import { formReviewDeliveryService } from '../services/form-review-delivery.service.js';

function validKey(supplied, expected) {
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
function authorized(req, reply) {
  if (!env.OPS_METRICS_TOKEN) { reply.code(404).send({error:'No disponible.'}); return false; }
  if (!validKey(req.headers['x-ops-token'], env.OPS_METRICS_TOKEN)) { reply.code(403).send({error:'Acceso denegado.'}); return false; }
  return true;
}
export async function opsRoutes(app) {
  // HTML y JavaScript públicos, pero ninguna consulta ni métrica se devuelve
  // sin un token administrativo largo enviado exclusivamente en CABECERA.
  app.get('/dashboard', async (req,reply) => {
    if (!env.OPS_METRICS_TOKEN) return reply.code(404).send({error:'No disponible.'});
    reply.header('Cache-Control','no-store');
    return reply.type('text/html; charset=utf-8').send(dashboardHtml);
  });
  app.get('/dashboard.js', async (req,reply) => {
    if (!env.OPS_METRICS_TOKEN) return reply.code(404).send({error:'No disponible.'});
    reply.header('Cache-Control','no-store');
    return reply.type('application/javascript; charset=utf-8').send(dashboardJs);
  });
  app.get('/metrics', async (req, reply) => {
    if (!authorized(req, reply)) return;
    reply.header('Cache-Control', 'no-store');
    return {
      inMemory: true,
      warning: 'Las métricas, sesiones y reintentos no sobreviven a reinicios del proceso.',
      delivery: formReviewDeliveryService.snapshot(),
      groqUsage: usageService.snapshot(),
      ...observability.snapshot()
    };
  });
}
