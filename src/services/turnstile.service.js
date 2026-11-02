import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export class TurnstileService {
  async verify({ token, remoteIp, expectedAction = env.TURNSTILE_CONTACT_ACTION }) {
    if (!env.TURNSTILE_ENABLED) {
      return { success: true, bypassed: true };
    }

    if (!token) {
      return { success: false, errorCodes: ['missing-input-response'] };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: remoteIp,
          idempotency_key: randomUUID()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, errorCodes: ['siteverify-http-error'] };
      }

      const result = await response.json();
      const hostnameOk = !env.TURNSTILE_EXPECTED_HOSTNAME || result.hostname === env.TURNSTILE_EXPECTED_HOSTNAME;
      const actionOk = !expectedAction || result.action === expectedAction;

      return {
        success: Boolean(result.success && hostnameOk && actionOk),
        hostname: result.hostname,
        action: result.action,
        errorCodes: !hostnameOk ? ['hostname-mismatch'] : (!actionOk ? ['action-mismatch'] : (result['error-codes'] || []))
      };
    } catch (error) {
      return { success: false, errorCodes: [error?.name === 'AbortError' ? 'siteverify-timeout' : 'siteverify-error'] };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const turnstileService = new TurnstileService();
