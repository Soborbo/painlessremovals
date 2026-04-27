/**
 * BOOT ORCHESTRATOR
 * 
 * Initializes all features based on feature flags
 * Called once at application startup
 */

import { CONFIG } from './config';
import { logger } from './utils/logger';

let _booted = false;
let _bootError: Error | null = null;

/**
 * Boot application
 * Initializes enabled features
 */
export async function bootApp(_env?: any): Promise<void> {
  if (_booted) {
    logger.debug('Boot', 'Already booted, skipping');
    return;
  }

  if (_bootError) {
    logger.warn('Boot', 'Previous boot failed, retrying...', { error: _bootError.message });
    _bootError = null;
  }

  logger.info('Boot', 'Starting application boot...');

  try {
    const startTime = Date.now();

    // 1. Initialize security (always enabled)
    logger.debug('Boot', 'Initializing security...');
    const { initSecurity } = await import('./features/security');
    await initSecurity();

    // 2. Initialize enrichment if enabled
    if (CONFIG.features.ipEnrichment) {
      logger.debug('Boot', 'Initializing enrichment...');
      const { initEnrichment } = await import('./features/enrichment');
      await initEnrichment();
    }

    // 3. Error tracking (initialized via middleware + layout scripts)
    if (CONFIG.features.errorTracking) {
      logger.info('Boot', 'Error tracking enabled (client: layout script, server: middleware)');
    }

    const bootTime = Date.now() - startTime;
    _booted = true;

    logger.info('Boot', `✓ Application boot complete (${bootTime}ms)`, {
      features: {
        security: true,
        enrichment: CONFIG.features.ipEnrichment,
        errorTracking: CONFIG.features.errorTracking,
      },
    });
  } catch (error) {
    _bootError = error instanceof Error ? error : new Error(String(error));
    logger.error('Boot', 'Boot failed', { error: _bootError });
    throw _bootError;
  }
}

/**
 * Check if application is booted
 */
export function isBooted(): boolean {
  return _booted;
}

/**
 * Get boot error (if any)
 */
export function getBootError(): Error | null {
  return _bootError;
}
