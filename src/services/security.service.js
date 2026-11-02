import { env } from '../config/env.js';

const counters = new Map();
const scores = new Map();
const blocks = new Map();

function now() {
  return Date.now();
}

function cleanupExpired() {
  const t = now();
  for (const [key, value] of counters) if (value.resetAt <= t) counters.delete(key);
  for (const [key, value] of scores) if (value.resetAt <= t) scores.delete(key);
  for (const [key, unblockAt] of blocks) if (unblockAt <= t) blocks.delete(key);
}

function incrementWindow(key, windowSeconds) {
  cleanupExpired();
  const t = now();
  const current = counters.get(key);
  if (!current || current.resetAt <= t) {
    const fresh = { count: 1, resetAt: t + windowSeconds * 1000 };
    counters.set(key, fresh);
    return { count: 1, retryAfterSeconds: windowSeconds };
  }
  current.count += 1;
  return {
    count: current.count,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - t) / 1000))
  };
}

function makeLimitError(message, code, retryAfterSeconds) {
  const error = new Error(message);
  error.status = 429;
  error.code = code;
  if (retryAfterSeconds) error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

export class SecurityService {
  async isBlocked(ipHash) {
    cleanupExpired();
    return (blocks.get(ipHash) || 0) > now();
  }

  async recordEvent({ ipHash, sessionId = null, type, score = 1, metadata = {} }) {
    cleanupExpired();
    const t = now();
    const current = scores.get(ipHash);
    const state = !current || current.resetAt <= t
      ? { score, resetAt: t + 60 * 60 * 1000 }
      : { score: current.score + score, resetAt: current.resetAt };
    scores.set(ipHash, state);

    // No se persiste nada: solo log técnico sin datos personales en claro.
    console.warn('[SECURITY_EVENT]', { type, score, sessionId, metadata });

    if (state.score >= 10) {
      blocks.set(ipHash, t + env.ABUSE_BLOCK_MINUTES * 60 * 1000);
    }
    return state.score;
  }

  async assertCanAttemptContact(ipHash) {
    if (await this.isBlocked(ipHash)) throw makeLimitError('Acceso temporalmente bloqueado por actividad inusual.', 'ABUSE_BLOCKED', env.ABUSE_BLOCK_MINUTES * 60);
    const minute = incrementWindow(`contact-attempt:min:${ipHash}`, 60);
    if (minute.count > env.MAX_CONTACT_ATTEMPTS_PER_IP_MINUTE) {
      await this.recordEvent({ ipHash, type: 'CONTACT_ATTEMPT_RATE_LIMIT', score: 2, metadata: { count: minute.count } });
      throw makeLimitError('Demasiados intentos de enviar el formulario.', 'CONTACT_ATTEMPT_LIMIT', minute.retryAfterSeconds);
    }
  }

  async assertCanSubmitContact(ipHash) {
    const hour = incrementWindow(`contact:hour:${ipHash}`, 3600);
    const day = incrementWindow(`contact:day:${ipHash}`, 86400);
    if (hour.count > env.MAX_CONTACT_PER_IP_HOUR || day.count > env.MAX_CONTACT_PER_IP_DAY) {
      await this.recordEvent({ ipHash, type: 'CONTACT_SUBMISSION_LIMIT', score: 3, metadata: { hour: hour.count, day: day.count } });
      throw makeLimitError('Se alcanzó temporalmente el límite de formularios.', 'CONTACT_LIMIT', Math.min(hour.retryAfterSeconds, day.retryAfterSeconds));
    }
  }

}

export const securityService = new SecurityService();
