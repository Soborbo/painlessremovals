/**
 * i-mve CRM INTEGRATION
 *
 * Public API for syncing quotes to the i-mve CRM system.
 */

export { mapQuoteToImvePayload } from './mapper';
export type { ImvePayload } from './mapper';
export { sendToImve } from './client';
export type { ImveConfig, ImveResult } from './client';
export { replayImveDeadLetters, countImveDeadLetters } from './dead-letter';
export type { ImveReplaySummary } from './dead-letter';

import { logger } from '@/lib/utils/logger';
import type { KVNamespace } from '@/lib/utils/kv';
import type { ImveConfig, ImveResult } from './client';
import { sendToImve } from './client';
import { mapQuoteToImvePayload } from './mapper';
import { dequeueImveLead, enqueueImveLead } from './dead-letter';

/**
 * Sync a saved quote to the i-mve CRM.
 * Maps the calculator data to the i-mve format and sends it via their API.
 *
 * When `dlqKv` is provided, a delivery failure parks the mapped payload in
 * the dead-letter queue (replayable via /api/imve/recovery) and a success
 * clears any entry left by an earlier failed attempt for the same quote.
 */
export async function syncQuoteToImve(
  quote: { id: string | number; name?: string | null; email?: string | null; phone?: string | null; totalPrice?: number },
  calculatorData: Record<string, unknown>,
  config: ImveConfig,
  dlqKv?: KVNamespace | null
): Promise<ImveResult> {
  logger.info('i-mve', 'Starting sync', { quoteId: quote.id });

  const payload = mapQuoteToImvePayload(quote, calculatorData);

  if (!payload.first_name) {
    logger.warn('i-mve', 'Skipping sync - no first_name (required field)', { quoteId: quote.id });
    return { success: false, error: 'Missing required field: first_name' };
  }

  const result = await sendToImve(payload, config);

  if (result.success) {
    logger.info('i-mve', 'Sync completed', { quoteId: quote.id });
    if (dlqKv) await dequeueImveLead(dlqKv, String(quote.id));
  } else {
    logger.error('i-mve', 'Sync failed', { quoteId: quote.id, error: result.error });
    if (dlqKv) await enqueueImveLead(dlqKv, String(quote.id), payload, result.error || 'unknown');
  }

  return result;
}
