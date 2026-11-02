import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { getClientIp, hashIp } from '../security/identity.js';
import { securityService } from '../services/security.service.js';
import { turnstileService } from '../services/turnstile.service.js';
import { notificationService } from '../services/notification.service.js';
import { formReviewDeliveryService } from '../services/form-review-delivery.service.js';

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(60),
  email: z.string().trim().email().max(160),
  consultationType: z.enum([
    'Derecho a la salud',
    'Derecho del consumidor',
    'Daños y perjuicios',
    'Derecho previsional',
    'Derecho tributario',
    'Otra consulta'
  ]),
  consultationReason: z.string().trim().min(1).max(21),
  location: z.string().trim().min(2).max(160),
  caseDescription: z.string().trim().min(10).max(4000),
  turnstileToken: z.string().max(2048).optional().default('')
});

// La evaluación lenta comienza después de responder al formulario.
function afterHttpResponse(reply) {
  return new Promise(resolve => {
    const raw = reply.raw;
    if (!raw || raw.writableFinished || raw.destroyed) return resolve();
    const done = () => {
      raw.off('finish', done);
      raw.off('close', done);
      resolve();
    };
    raw.once('finish', done);
    raw.once('close', done);
  });
}

export async function submitContact(req, res) {
  const ipHash = hashIp(req);
  try {
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.code(400).send({ error: 'Revisá los datos del formulario.', code: 'CONTACT_INVALID' });

    await securityService.assertCanAttemptContact(ipHash);
    const verification = await turnstileService.verify({
      token: parsed.data.turnstileToken,
      remoteIp: getClientIp(req),
      expectedAction: env.TURNSTILE_CONTACT_ACTION
    });
    if (!verification.success) {
      await securityService.recordEvent({ ipHash, type: 'CONTACT_TURNSTILE_FAILED', score: 2, metadata: { errorCodes: verification.errorCodes || [] } });
      return res.code(403).send({ error: 'No pudimos validar la verificación de seguridad.', code: 'TURNSTILE_FAILED' });
    }

    await securityService.assertCanSubmitContact(ipHash);

    const { turnstileToken: _ignored, ...form } = parsed.data;
    const submission = {
      id: randomUUID(),
      ...form,
      receivedAt: new Date().toISOString()
    };
    // No esperar a Groq: el frontend del formulario tiene timeout de 15 segundos.
    // La recepción se confirma solo después de que SMTP acepta el correo al estudio.
    const delivery = await notificationService.notifyContact(submission);

    if (!delivery.studyDelivered) {
      const error = new Error('No se pudo entregar la consulta al estudio por email.');
      error.status = 503;
      error.code = 'STUDY_EMAIL_FAILED';
      throw error;
    }

    // Una segunda notificación con el informe del experto se enviará al
    // estudio, con la misma referencia y sin retrasar la respuesta HTTP.
    formReviewDeliveryService.enqueue({ submission, startAfter: afterHttpResponse(res) });

    return res.code(201).send({
      id: submission.id,
      reference: submission.id.slice(0, 8).toUpperCase(),
      notificationDelivered: true,
      clientEmailDelivered: delivery.clientDelivered,
      ...(delivery.errors.length ? { warning: delivery.errors.join(' | ') } : {})
    });
  } catch (error) {
    throw error;
  }
}
