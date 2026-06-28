/**
 * CENTRAL LOGGER
 *
 * Structured logging with levels
 * Production: only errors logged
 * Development: all logs visible
 */

import { CONFIG } from '@/lib/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Field names whose values must never reach persisted Workers Logs. The match
// is name-based (case-insensitive substring) so `userEmail`, `client_phone`,
// `cf-connecting-ip` etc. are all caught. Logs are persisted at 100% in
// production (observability), so PII/secrets in `data` would be retained.
const REDACT_KEY_RE = /(email|phone|name|address|postcode|postal|\bip\b|authorization|secret|token|api[_-]?key|cookie|password)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEY_RE.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/**
 * Log message with level
 */
export function log(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>
): void {
  // In production, only log errors and warns
  if (!CONFIG.debug && level !== 'error' && level !== 'warn') {
    return;
  }

  const prefix = `[${level.toUpperCase()}][${module}]`;
  // Redact PII/secrets from structured data before it hits persisted logs.
  // Skipped in debug/dev so local debugging still sees full payloads.
  const safeData = data ? (CONFIG.debug ? data : redact(data)) : '';

  switch (level) {
    case 'error':
      console.error(prefix, message, safeData);
      break;
    case 'warn':
      console.warn(prefix, message, safeData);
      break;
    case 'info':
      console.info(prefix, message, safeData);
      break;
    case 'debug':
      console.debug(prefix, message, safeData);
      break;
  }
}

/**
 * Convenience methods
 */
export const logger = {
  debug: (module: string, message: string, data?: Record<string, unknown>) =>
    log('debug', module, message, data),

  info: (module: string, message: string, data?: Record<string, unknown>) =>
    log('info', module, message, data),

  warn: (module: string, message: string, data?: Record<string, unknown>) =>
    log('warn', module, message, data),

  error: (module: string, message: string, data?: Record<string, unknown>) =>
    log('error', module, message, data),
};
