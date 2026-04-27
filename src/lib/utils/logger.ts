/**
 * CENTRAL LOGGER
 *
 * Structured logging with levels
 * Production: only errors logged
 * Development: all logs visible
 */

import { CONFIG } from '@/lib/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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

  switch (level) {
    case 'error':
      console.error(prefix, message, data || '');
      break;
    case 'warn':
      console.warn(prefix, message, data || '');
      break;
    case 'info':
      console.info(prefix, message, data || '');
      break;
    case 'debug':
      console.debug(prefix, message, data || '');
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
