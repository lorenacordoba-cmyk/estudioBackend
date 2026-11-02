import 'dotenv/config';
import { z } from 'zod';

const boolFromString = z.string().default('false').transform(v => v.toLowerCase() === 'true');

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  OPS_METRICS_TOKEN: z.string().default('').refine(v => !v || v.length >= 8, 'OPS_METRICS_TOKEN necesita al menos 8 caracteres'),
  DELIVERY_RETRY_MAX: z.coerce.number().int().min(1).max(6).default(3),
  DELIVERY_RETRY_DELAY_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
  FRONTEND_ORIGIN: z.string().default('http://localhost:4200'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY es obligatoria'),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_LEGAL_REVIEW_MODEL: z.string().default('openai/gpt-oss-20b'),
  GROQ_LEGAL_REVIEW_MAX_COMPLETION_TOKENS: z.coerce.number().int().min(800).max(4000).default(2000),
  GROQ_TPM_TARGET: z.coerce.number().int().min(1000).max(200000).default(6500),
  GROQ_RPM_TARGET: z.coerce.number().int().min(1).max(10000).default(25),
  GROQ_RATE_MAX_WAIT_MS: z.coerce.number().int().min(0).max(180000).default(90000),
  GROQ_RATE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
  GROQ_RATE_MAX_QUEUE: z.coerce.number().int().min(1).max(200).default(10),
  GROQ_LEGAL_REVIEW_REASONING_EFFORT: z.enum(['low','medium','high']).default('medium'),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  GROQ_DAILY_BUDGET_USD: z.coerce.number().positive().default(15),
  GROQ_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(1000),
  GROQ_DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().default(2000000),
  GROQ_INPUT_USD_PER_1M: z.coerce.number().nonnegative().default(0.075),
  GROQ_CACHED_INPUT_USD_PER_1M: z.coerce.number().nonnegative().default(0.037),
  GROQ_OUTPUT_USD_PER_1M: z.coerce.number().nonnegative().default(0.30),

  TURNSTILE_ENABLED: boolFromString,
  TURNSTILE_SECRET_KEY: z.string().optional().default(''),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().optional().default(''),
  TURNSTILE_CONTACT_ACTION: z.string().default('legal_contact_form'),

  SECURITY_HASH_SECRET: z.string().min(24, 'SECURITY_HASH_SECRET debe tener al menos 24 caracteres'),
  MAX_CONTACT_ATTEMPTS_PER_IP_MINUTE: z.coerce.number().int().positive().default(10),
  MAX_CONTACT_PER_IP_HOUR: z.coerce.number().int().positive().default(5),
  MAX_CONTACT_PER_IP_DAY: z.coerce.number().int().positive().default(15),
  ABUSE_BLOCK_MINUTES: z.coerce.number().int().positive().default(60),

  STUDY_NAME: z.string().default('Estudio Jurídico Lorena Córdoba'),
  STUDY_EMAIL: z.string().email().default('lorenacordoba@gmail.com'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST es obligatorio'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: boolFromString,
  SMTP_USER: z.string().min(1, 'SMTP_USER es obligatorio'),
  SMTP_PASS: z.string().min(1, 'SMTP_PASS es obligatorio'),
  SMTP_FROM: z.string().optional().default('')
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.TURNSTILE_ENABLED) {
    ctx.addIssue({ code: 'custom', path: ['TURNSTILE_ENABLED'], message: 'En producción TURNSTILE_ENABLED debe ser true' });
  }
  if (data.TURNSTILE_ENABLED && !data.TURNSTILE_SECRET_KEY) {
    ctx.addIssue({ code: 'custom', path: ['TURNSTILE_SECRET_KEY'], message: 'TURNSTILE_SECRET_KEY es obligatoria si TURNSTILE_ENABLED=true' });
  }
  if (data.NODE_ENV === 'production' && data.TURNSTILE_ENABLED && !data.TURNSTILE_EXPECTED_HOSTNAME) {
    ctx.addIssue({ code: 'custom', path: ['TURNSTILE_EXPECTED_HOSTNAME'], message: 'En producción configurá el hostname esperado de Turnstile' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
