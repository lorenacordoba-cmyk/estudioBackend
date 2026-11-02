import { env } from '../config/env.js';

const emptyState = day => ({ day, requests: 0, tokens: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
let state = emptyState('');
function ensureToday() {
  const day = new Date().toISOString().slice(0, 10);
  if (state.day !== day) state = emptyState(day);
  return state;
}

/** Groq usa prompt_tokens/completion_tokens; métricas de caché cuando están disponibles. */
export function calculateGroqUsage(raw = {}) {
  const inputTokens = Number(raw.prompt_tokens || 0);
  const outputTokens = Number(raw.completion_tokens || 0);
  const cachedInputTokens = Math.min(inputTokens, Number(raw.prompt_tokens_details?.cached_tokens || raw.input_tokens_details?.cached_tokens || 0));
  const estimatedCostUsd = (inputTokens - cachedInputTokens) / 1e6 * env.GROQ_INPUT_USD_PER_1M +
      cachedInputTokens / 1e6 * env.GROQ_CACHED_INPUT_USD_PER_1M +
      outputTokens / 1e6 * env.GROQ_OUTPUT_USD_PER_1M;
  return { inputTokens, outputTokens, cachedInputTokens, estimatedCostUsd };
}

export class UsageService {
  async assertWithinDailyLimits() {
    const usage = ensureToday();
    if (usage.tokens >= env.GROQ_DAILY_TOKEN_LIMIT || usage.costUsd >= env.GROQ_DAILY_BUDGET_USD || usage.requests >= env.GROQ_DAILY_REQUEST_LIMIT) {
      const error = new Error('El servicio de evaluación alcanzó temporalmente el límite de consumo.');
      error.status = 503;
      error.code = 'GROQ_CIRCUIT_OPEN';
      throw error;
    }
    usage.requests += 1;
  }
  async record({ response }) {
    const usage = ensureToday();
    const result = calculateGroqUsage(response?.usage || {});
    usage.tokens += result.inputTokens + result.outputTokens;
    usage.inputTokens += result.inputTokens;
    usage.outputTokens += result.outputTokens;
    usage.cachedInputTokens += result.cachedInputTokens;
    usage.costUsd += result.estimatedCostUsd;
    return result;
  }
  snapshot() { return { ...ensureToday() }; }
}
export const usageService = new UsageService();
