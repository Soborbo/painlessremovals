/**
 * i-mve DEAD-LETTER QUEUE
 *
 * When the i-mve API is unreachable (June 2026 incident: their edge silently
 * drops requests from Cloudflare egress IPs, so every call burns the full
 * 10s timeout), leads must not be lost. Failed syncs are parked in KV and
 * replayed via /api/imve/recovery once the endpoint is reachable again.
 *
 * Keyed by quote/callback id, so repeated failed attempts for the same lead
 * overwrite a single entry instead of stacking duplicates, and a later
 * successful attempt deletes it.
 */

import { logger } from '@/lib/utils/logger';
import { kvDelete, kvGet, kvPut, type KVNamespace } from '@/lib/utils/kv';
import type { ImvePayload } from './mapper';
import type { ImveConfig, ImveResult } from './client';
import { sendToImve } from './client';

const DLQ_PREFIX = 'imve_dlq:';

/** Keep undelivered leads around for 30 days — long enough to sort out the
 * upstream firewall/auth issue, short enough not to hoard stale PII in KV. */
const DLQ_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface ImveDeadLetterEntry {
  quoteId: string;
  payload: ImvePayload;
  failedAt: string;
  error: string;
}

function dlqKey(quoteId: string): string {
  return `${DLQ_PREFIX}${quoteId}`;
}

/** Park a failed lead for later replay. Overwrites any previous entry for
 * the same quote id. */
export async function enqueueImveLead(
  kv: KVNamespace | null,
  quoteId: string,
  payload: ImvePayload,
  error: string,
): Promise<boolean> {
  const entry: ImveDeadLetterEntry = {
    quoteId,
    payload,
    failedAt: new Date().toISOString(),
    error,
  };
  const stored = await kvPut(kv, dlqKey(quoteId), JSON.stringify(entry), {
    expirationTtl: DLQ_TTL_SECONDS,
  });
  if (stored) {
    logger.warn('i-mve', 'Lead parked in dead-letter queue for replay', { quoteId, error });
  } else {
    logger.error('i-mve', 'Failed to park lead in dead-letter queue — lead only in email/logs', {
      quoteId,
    });
  }
  return stored;
}

/** Drop a parked lead (a later attempt for the same quote id succeeded). */
export async function dequeueImveLead(kv: KVNamespace | null, quoteId: string): Promise<void> {
  await kvDelete(kv, dlqKey(quoteId));
}

export interface ImveReplaySummary {
  scanned: number;
  replayed: string[];
  failed: { quoteId: string; error: string }[];
  /** True when more entries remain beyond `limit` — call replay again. */
  hasMore: boolean;
}

/**
 * Re-send parked leads to i-mve. Entries are deleted on success and kept
 * (with their TTL) on failure. `limit` caps Worker subrequests per call;
 * the caller re-invokes while `hasMore` is true.
 */
export async function replayImveDeadLetters(
  kv: KVNamespace | null,
  config: ImveConfig,
  limit = 20,
): Promise<ImveReplaySummary> {
  const summary: ImveReplaySummary = { scanned: 0, replayed: [], failed: [], hasMore: false };
  if (!kv) return summary;

  const listing = await kv.list({ prefix: DLQ_PREFIX, limit });
  summary.hasMore = !listing.list_complete;

  for (const { name } of listing.keys) {
    summary.scanned++;
    const raw = await kvGet<string>(kv, name);
    if (!raw) continue; // expired between list and get

    let entry: ImveDeadLetterEntry;
    try {
      entry = JSON.parse(raw) as ImveDeadLetterEntry;
    } catch {
      logger.error('i-mve', 'Dropping unparseable dead-letter entry', { key: name });
      await kvDelete(kv, name);
      continue;
    }

    const result: ImveResult = await sendToImve(entry.payload, config);
    if (result.success) {
      await kvDelete(kv, name);
      summary.replayed.push(entry.quoteId);
      logger.info('i-mve', 'Dead-letter lead replayed', { quoteId: entry.quoteId });
    } else {
      summary.failed.push({ quoteId: entry.quoteId, error: result.error || 'unknown' });
    }
  }

  return summary;
}

/** Count parked leads (first page only — enough for a status readout). */
export async function countImveDeadLetters(
  kv: KVNamespace | null,
): Promise<{ count: number; isPartial: boolean }> {
  if (!kv) return { count: 0, isPartial: false };
  try {
    const listing = await kv.list({ prefix: DLQ_PREFIX, limit: 1000 });
    return { count: listing.keys.length, isPartial: !listing.list_complete };
  } catch (error) {
    logger.error('KV', 'Failed to count i-mve dead-letter entries', { error });
    return { count: 0, isPartial: true };
  }
}
