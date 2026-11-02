import { env } from './env.js';
import { GroqRateGate } from '../services/groq-rate-gate.js';
import { GroqClient } from '../services/groq-http.js';
export const groq = new GroqClient({
  apiKey: env.GROQ_API_KEY, baseUrl: env.GROQ_BASE_URL, timeoutMs: env.GROQ_TIMEOUT_MS,
  rateGate: new GroqRateGate({
    tpm: env.GROQ_TPM_TARGET, rpm: env.GROQ_RPM_TARGET,
    maxWaitMs: env.GROQ_RATE_MAX_WAIT_MS, maxPending: env.GROQ_RATE_MAX_QUEUE,
    maxRetries: env.GROQ_RATE_MAX_RETRIES
  })
});
