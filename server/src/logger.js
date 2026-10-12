import pino from 'pino';
import { config } from './config.js';

const SECRET_KEYS = [
  'password',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'client_secret',
  'clientSecret',
  'authorization',
  'cookie',
  'apiKey',
];

/**
 * Redaction is declared here, once. Call sites are then free to log whole
 * error or request objects without each having to remember what is secret --
 * which is the failure mode that leaks tokens into log aggregators.
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      ...SECRET_KEYS,
      ...SECRET_KEYS.map((k) => `*.${k}`),
      ...SECRET_KEYS.map((k) => `*.*.${k}`),
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  formatters: { level: (label) => ({ level: label }) },
});

/**
 * Strips token-shaped substrings out of free text (upstream response bodies,
 * stack traces) before it reaches a log sink.
 */
export function scrubText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[redacted-jwt]')
    // Provider API keys: Groq (gsk_…), Anthropic and DeepSeek (sk-…).
    .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]{16,}/g, '[redacted-key]')
    .replace(/("(?:access|refresh)_token"\s*:\s*)"[^"]*"/g, '$1"[redacted]"');
}
