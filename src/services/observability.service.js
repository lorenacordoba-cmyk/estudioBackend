/** Métricas operativas EN MEMORIA, sin mensajes, identificadores ni datos personales. */
const MAX_EVENTS = 100;
class Observability {
  constructor() { this.startedAt = Date.now(); this.events = []; this.counters = Object.create(null); this.latencies = Object.create(null); }
  increment(metric, amount = 1) { if (!/^[a-z_]+$/.test(metric)) return; this.counters[metric] = (this.counters[metric] || 0) + amount; }
  observe(name, milliseconds) {
    if (!/^[a-z_]+$/.test(name) || !Number.isFinite(milliseconds)) return;
    const values = this.latencies[name] ||= [];
    values.push(Math.max(0, Math.round(milliseconds)));
    if (values.length > MAX_EVENTS) values.shift();
  }
  event(kind) {
    const allowed = new Set(['review_started','review_failed','mail_attempted','mail_failed','mail_study_accepted','mail_client_accepted','delivery_retry_scheduled','form_review_started','form_review_delivered','form_review_failed']);
    if (!allowed.has(kind)) return;
    this.increment(kind);
    this.events.push({ kind, at: new Date().toISOString() });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }
  snapshot() {
    const latency = Object.fromEntries(Object.entries(this.latencies).map(([key, values]) => {
      const sorted = [...values].sort((a,b) => a-b);
      const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
      return [key, { count: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95) }];
    }));
    return { uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000), counters: { ...this.counters }, latency, recentEvents: [...this.events] };
  }
}
export const observability = new Observability();
