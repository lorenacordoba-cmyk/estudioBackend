import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

function hmac(value) {
  return createHmac('sha256', env.SECURITY_HASH_SECRET).update(String(value || '')).digest('hex');
}

export function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function hashIp(req) {
  return hmac(`ip:${getClientIp(req)}`);
}

export function hashUserAgent(req) {
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 512);
  return ua ? hmac(`ua:${ua}`) : null;
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return hmac(`session-token:${token}`);
}

export function verifySessionToken(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashSessionToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function shortFingerprint(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}
