/**
 * SECURITY FEATURE
 *
 * Central security utilities
 */

import { logger } from '@/lib/utils/logger';

// Re-export security functions
export {
  checkRateLimit,
  getRemainingRequests,
  createRateLimitResponse,
} from './rate-limit';
export { checkPayloadSize, createPayloadTooLargeResponse } from './payload-limit';

let _initialized = false;

/**
 * Initialize security feature
 */
export async function initSecurity(): Promise<void> {
  if (_initialized) return;

  logger.info('Security', 'Initializing...');

  try {
    // Security features are always-on, just mark as ready
    _initialized = true;
    logger.info('Security', '✓ Initialized');
  } catch (error) {
    logger.error('Security', 'Initialization failed', { error });
  }
}

