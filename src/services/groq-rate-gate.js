/**
 * Presupuesto TPM/RPM por modelo, compartido en este proceso Fastify.
 * No guarda prompts ni datos de clientes. En múltiples réplicas usar Redis o
 * un coordinador externo; Groq es la fuente de verdad de sus cuotas.
 */
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function estimateGroqTokens(request) {
  // Estimación deliberadamente conservadora, NO tokenizer exacto.
  // Se actualiza el registro con el consumo real de Groq tras cada éxito.
  const size = (request.messages || []).reduce((sum, msg) =>
    sum + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content || '').length) + 20, 0);
  const schemaChars = request.response_format?.type === 'json_schema'
    ? JSON.stringify(request.response_format.json_schema || {}).length : 0;
  const inputEstimate = Math.ceil((size + schemaChars) / 3);
  return Math.max(50, inputEstimate) + Math.max(0, Number(request.max_completion_tokens) || 0);
}

function quotaError(code, seconds = 1) {
  const error = new Error('El regulador local de concurrencia y presupuesto de IA requiere una pausa.');
  error.code = code;
  error.status = 429;
  error.retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  return error;
}

function oversizedRequestError(estimate, tpm) {
  const error = new Error('El contexto de la consulta excede el presupuesto de tokens configurado en el backend.');
  error.code = 'GROQ_REQUEST_TOO_LARGE';
  // No es HTTP 429 de Groq y esperar 60 segundos no resuelve el tamaño.
  error.status = 413;
  error.estimatedTokens = estimate;
  error.configuredTpm = tpm;
  return error;
}

function currentSettings(model, settings) {
  return {
    tpm: settings.tpm,
    rpm: settings.rpm
  };
}

export class GroqRateGate {
  constructor({
    tpm = 6500, rpm = 25,
    maxWaitMs = 65000, maxPending = 10, maxRetries = 3,
    now = () => Date.now(), sleep = pause
  } = {}) {
    Object.assign(this, { tpm, rpm, maxWaitMs, maxPending, maxRetries, now, sleep });
    this.states = new Map();
  }

  snapshot() {
    const now = this.now();
    return [...this.states.entries()].map(([model, state]) => {
      const events = state.events.filter(event => now - event.at < 60000);
      const { tpm, rpm } = currentSettings(model, this);
      return {
        model,
        targetTokensPerMinute: tpm,
        targetRequestsPerMinute: rpm,
        estimatedUsedTokensLastMinute: events.reduce((sum, e) => sum + e.tokens, 0),
        requestsLastMinute: events.length,
        pending: state.pending,
        cooldownSeconds: Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000)),
        // La cuota real la determina Groq (organización, otros procesos y scripts).
        upstreamRemainingTokens: state.providerResetAt > now ? state.providerRemainingTokens : null,
        upstreamResetSeconds: Math.max(0, Math.ceil((state.providerResetAt - now) / 1000))
      };
    });
  }

  getState(model) {
    if (!this.states.has(model)) this.states.set(model, {
      queue: Promise.resolve(), pending: 0, events: [], cooldownUntil: 0,
      providerRemainingTokens: null, providerResetAt: 0, providerLimit: null
    });
    return this.states.get(model);
  }

  async execute(request, fetchCompletion) {
    const model = String(request.model || 'unknown');
    const state = this.getState(model);
    if (state.pending >= this.maxPending) throw quotaError('GROQ_QUEUE_FULL', 15);
    state.pending += 1;
    const previous = state.queue;
    let release;
    const next = new Promise(resolve => { release = resolve; });
    state.queue = previous.catch(() => {}).then(() => next);
    const enqueuedAt = this.now();
    try {
      await previous;
      return await this._run(state, model, request, fetchCompletion, enqueuedAt);
    } finally {
      state.pending -= 1;
      release();
    }
  }

  observeProviderRate(state, rate) {
    if (!rate || typeof rate !== 'object') return;
    if (Number.isFinite(rate.limitTokens) && rate.limitTokens > 0) {
      state.providerLimit = rate.limitTokens;
    }
    if (Number.isFinite(rate.remainingTokens) && rate.remainingTokens >= 0) {
      state.providerRemainingTokens = rate.remainingTokens;
      // El encabezado de Groq incluye el tiempo relativo a recuperación TPM.
      // Sin ese dato, evitar considerar indefinidamente una lectura antigua.
      state.providerResetAt = this.now() + (rate.resetMs ?? 60000);
    }
  }

  async _run(state, model, request, fetchCompletion, enqueuedAt) {
    const { tpm, rpm } = currentSettings(model, this);
    const estimate = estimateGroqTokens(request);
    if (estimate > tpm) throw oversizedRequestError(estimate, tpm);
    let attempts = 0;
    while (attempts <= this.maxRetries) {
      const now = this.now();
      state.events = state.events.filter(event => now - event.at < 60000);
      const currentlyUsed = state.events.reduce((total, item) => total + item.tokens, 0);
      const requiredSpace = currentlyUsed + estimate > tpm || state.events.length >= rpm;
      let waitMs = Math.max(0, state.cooldownUntil - now);
      // El presupuesto local no ve scripts, otras réplicas ni otras aplicaciones
      // que utilicen la misma organización de Groq. Respetar su saldo real.
      if (state.providerResetAt > now && state.providerRemainingTokens !== null &&
          state.providerRemainingTokens < estimate) {
        waitMs = Math.max(waitMs, state.providerResetAt - now + 350);
      }
      if (requiredSpace) {
        let freedTokens = 0;
        let freedRequests = 0;
        for (const event of state.events) {
          freedTokens += event.tokens;
          freedRequests += 1;
          if (currentlyUsed - freedTokens + estimate <= tpm && state.events.length - freedRequests < rpm) {
            waitMs = Math.max(waitMs, event.at + 60000 - now + 150);
            break;
          }
        }
      }
      if (waitMs > 0) {
        const elapsed = now - enqueuedAt;
        if (waitMs + elapsed > this.maxWaitMs) {
          throw quotaError('GROQ_LOCAL_RATE_LIMIT', (waitMs + 999) / 1000);
        }
        await this.sleep(waitMs);
        continue; // Tras esperar, recalcular cuota y cooldown antes de reservar.
      }
      // Reservamos antes de iniciar la solicitud, incluso si falla por red.
      const reservation = { at: now, tokens: estimate };
      state.events.push(reservation);
      try {
        const response = await fetchCompletion();
        const raw = response?.usage || {};
        const input = Number(raw.prompt_tokens || 0);
        const cached = Number(raw.prompt_tokens_details?.cached_tokens || 0);
        const output = Number(raw.completion_tokens || 0);
        const actual = Math.max(1, input - Math.min(input, cached) + output);
        if (input || output) reservation.tokens = actual;
        this.observeProviderRate(state, response?.groqRate);
        // Si el proveedor no dio encabezados, el presupuesto local continúa
        // siendo la estimación segura del uso total dentro del proceso.
        return response;
      } catch (error) {
        // En 429 no se ha generado respuesta; conservar margen sin desperdiciar
        // durante toda la ventana, respetando el tiempo indicado por el proveedor.
        if (error?.upstreamStatus !== 429) throw error;
        state.events = state.events.filter(item => item !== reservation);
        this.observeProviderRate(state, error.groqRate);
        // Retry-After puede ser 1s y no bastar si la solicitud necesita
        // más tokens que el saldo actual. También considerar el reset TPM y
        // aplicar retroceso progresivo para evitar saturar el proveedor.
        const retryMs = Math.max(
          1200,
          (Number(error.retryAfterSeconds) || 1) * 1000 + 400,
          error.groqRate?.resetMs ? error.groqRate.resetMs + 350 : 0,
          Math.min(8000, 1000 * 2 ** (attempts + 1))
        );
        state.cooldownUntil = Math.max(state.cooldownUntil, this.now() + retryMs);
        if (attempts >= this.maxRetries || this.now() - enqueuedAt + retryMs > this.maxWaitMs) {
          // Comunicar al frontend la pausa necesaria sin reintentar en bucle.
          error.retryAfterSeconds = Math.max(Number(error.retryAfterSeconds) || 0, Math.ceil(retryMs / 1000));
          throw error;
        }
        attempts += 1;
      }
    }
    throw quotaError('GROQ_LOCAL_RATE_LIMIT', 1);
  }
}
