/** Información numérica de cuota aportada por Groq, nunca prompts ni cuerpos. */
export function parseGroqDurationMs(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(raw);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const ms = (Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)) * 1000;
  return Number.isFinite(ms) && ms >= 0 && ms <= 3600000 ? Math.ceil(ms) : null;
}

export function readGroqRateHeaders(headers) {
  if (!headers?.get) return null;
  const numeric = name => {
    const value = headers.get(name);
    if (value == null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const remainingTokens = numeric('x-ratelimit-remaining-tokens');
  const limitTokens = numeric('x-ratelimit-limit-tokens');
  const resetMs = parseGroqDurationMs(headers.get('x-ratelimit-reset-tokens'));
  if (remainingTokens === null && limitTokens === null && resetMs === null) return null;
  return { remainingTokens, limitTokens, resetMs };
}

/** Cliente HTTP acotado a Chat Completions de Groq; sin dependencia del SDK de OpenAI. */
export class GroqClient {
  constructor({ apiKey, baseUrl = 'https://api.groq.com/openai/v1', timeoutMs = 45000, fetchImpl = fetch, rateGate = null } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.rateGate = rateGate;
    this.chat = { completions: { create: request => this.createCompletion(request) } };
  }

  async createCompletion(request) {
    return this.rateGate
      ? this.rateGate.execute(request, () => this._performCompletion(request))
      : this._performCompletion(request);
  }

  async _performCompletion(request) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: false, ...request }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (cause) {
      // El cuerpo de la solicitud tiene información confidencial del cliente.
      // Nunca incorporarlo (ni los headers) al error o a los logs.
      const timedOut = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
      const error = new Error(timedOut
        ? 'Se agotó el tiempo de respuesta de GroqCloud.'
        : 'No se pudo establecer comunicación con GroqCloud.');
      error.code = timedOut ? 'GROQ_TIMEOUT' : 'GROQ_NETWORK_ERROR';
      error.status = 503;
      throw error;
    }
    if (!response.ok) {
      // Groq puede devolver HTTP 400/401/404 para un parámetro, clave o modelo.
      // Antes TODO eso aparecía como 503, ocultando la causa real.
      // Del cuerpo externo se leen solo códigos técnicos simples; nunca el
      // texto libre del error, que puede contener información del cliente.
      let upstreamCode;
      let upstreamIssue;
      let upstreamParameter;
      try {
        const body = await response.json();
        const raw = body?.error?.code;
        if (typeof raw === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(raw)) {
          upstreamCode = raw;
        }
        // Solo categorías de diagnóstico, nunca el texto del proveedor:
        // el error original podría contener fragmentos de la consulta privada.
        const rawParam = body?.error?.param;
        if (typeof rawParam === 'string' && /^(response_format|json_schema|reasoning_effort|model|max_completion_tokens)$/.test(rawParam)) {
          upstreamParameter = rawParam;
        }
        const diagnosticText = [raw, rawParam, body?.error?.message].filter(x => typeof x === 'string').join(' ');
        if (response.status === 429) {
          upstreamIssue = 'rate_limit';
        } else if (/(json_schema|response.format|response_format|structured.output|structured.generation|json.validate|json_schema|schema)/i.test(diagnosticText)) {
          upstreamIssue = 'schema';
        } else if (/reasoning_effort/i.test(diagnosticText)) {
          upstreamIssue = 'reasoning_effort';
        } else if (/max_completion_tokens/i.test(diagnosticText)) {
          upstreamIssue = 'max_completion_tokens';
        } else if (/(model|does not exist|decommissioned)/i.test(diagnosticText)) {
          upstreamIssue = 'model';
        }
      } catch { /* No depender del formato de errores del proveedor. */ }

      const errors = {
        400: ['GROQ_REQUEST_REJECTED', 502, 'GroqCloud rechazó los parámetros de la solicitud (HTTP 400).'],
        401: ['GROQ_CREDENTIALS_REJECTED', 502, 'GroqCloud rechazó la clave API (HTTP 401).'],
        403: ['GROQ_ACCESS_DENIED', 502, 'La clave no tiene acceso al recurso solicitado en GroqCloud (HTTP 403).'],
        404: ['GROQ_MODEL_NOT_FOUND', 502, 'El modelo o endpoint configurado no existe en GroqCloud (HTTP 404).'],
        429: ['GROQ_RATE_LIMIT', 429, 'GroqCloud alcanzó su límite de solicitudes o tokens (HTTP 429).']
      };
      const [code, status, message] = errors[response.status] ||
        ['GROQ_UPSTREAM_ERROR', 503, `GroqCloud no pudo procesar la solicitud (HTTP ${response.status}).`];
      const error = new Error(message);
      error.code = code;
      error.status = status;
      error.upstreamStatus = response.status;
      if (upstreamCode) error.upstreamCode = upstreamCode;
      if (upstreamIssue) error.upstreamIssue = upstreamIssue;
      if (upstreamParameter) error.upstreamParameter = upstreamParameter;
      error.groqRate = readGroqRateHeaders(response.headers);
      const retryRaw = response.headers?.get?.('retry-after');
      const retry = retryRaw ? Number(retryRaw) : NaN;
      if (Number.isFinite(retry) && retry > 0) error.retryAfterSeconds = Math.ceil(retry);
      else if (response.status === 429 && error.groqRate?.resetMs > 0) {
        error.retryAfterSeconds = Math.ceil(error.groqRate.resetMs / 1000);
      }
      throw error;
    }
    const body = await response.json();
    // Los metadatos de cuota son internos, no deben contaminar el JSON de Groq.
    if (body && typeof body === 'object') {
      Object.defineProperty(body, 'groqRate', {
        value: readGroqRateHeaders(response.headers), enumerable: false
      });
    }
    return body;
  }
}


