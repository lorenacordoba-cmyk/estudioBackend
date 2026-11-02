import { env } from '../config/env.js';
import { legalSpecialistService } from './legal-specialist.service.js';
import { notificationService } from './notification.service.js';
import { observability } from './observability.service.js';

/**
 * Segunda entrega del formulario: informe jurídico después del HTTP 201.
 * El formulario ya fue entregado al estudio antes de encolar este análisis.
 * Cola en memoria, con reintentos acotados; no sobrevive reinicios del backend.
 */
export class FormReviewDeliveryService {
  constructor({ reviewer, notifier, schedule = setImmediate, logger = console,
    maxAttempts = 3, retryDelayMs = 5000 } = {}) {
    this.reviewer = reviewer;
    this.notifier = notifier;
    this.schedule = schedule;
    this.logger = logger;
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
    this.jobs = new Map();
  }

  enqueue({ submission, startAfter = null }) {
    if (this.jobs.has(submission.id)) return false;
    const job = { submission, review: null, attempts: 0, running: false, timer: null };
    this.jobs.set(submission.id, job);
    job.promise = Promise.resolve(startAfter)
      .then(() => new Promise(resolve => this.schedule(resolve)))
      .then(() => this.run(job))
      .catch(error => this.fail(job, error));
    return true;
  }

  async run(job) {
    if (!this.jobs.has(job.submission.id) || job.running) return;
    job.running = true;
    job.attempts++;
    try {
      if (!job.review) {
        observability.event('form_review_started');
        job.review = await this.reviewer.reviewForm({ submission: job.submission });
      }
      await this.notifier.sendStudyContactReviewEmail({ submission: job.submission, legalReview: job.review });
      observability.event('form_review_delivered');
      this.jobs.delete(job.submission.id);
    } catch (error) {
      this.fail(job, error);
    } finally {
      job.running = false;
    }
  }

  fail(job, error) {
    observability.event('form_review_failed');
    this.logger.warn?.({ code: error?.code || 'FORM_REVIEW_DELIVERY_FAILED' }, 'No se pudo preparar/enviar la evaluación del formulario');
    if (job.attempts >= this.maxAttempts) {
      this.jobs.delete(job.submission.id);
      return;
    }
    const delay = Math.min(60000, this.retryDelayMs * 2 ** Math.max(0, job.attempts - 1));
    job.timer = setTimeout(() => {
      job.timer = null;
      job.promise = this.run(job);
    }, delay);
    job.timer.unref?.();
  }

  // Espera las tareas en curso durante un cierre controlado del backend.
  async drain() {
    const promises = [...this.jobs.values()].map(job => job.promise).filter(Boolean);
    if (promises.length) await Promise.allSettled(promises);
  }

  /** Diagnóstico agregado, sin exponer datos de contacto de la consulta. */
  snapshot() { return { pendingFormReviews: this.jobs.size }; }
  shutdown() {
    for (const job of this.jobs.values()) if (job.timer) clearTimeout(job.timer);
    this.jobs.clear();
  }
}

export const formReviewDeliveryService = new FormReviewDeliveryService({
  reviewer: legalSpecialistService,
  notifier: notificationService,
  maxAttempts: env.DELIVERY_RETRY_MAX,
  retryDelayMs: env.DELIVERY_RETRY_DELAY_MS
});
