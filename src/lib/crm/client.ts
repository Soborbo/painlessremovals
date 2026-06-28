/**
 * CRM webhook delivery client.
 *
 * Builds the transport envelope, serializes the body ONCE, signs that exact
 * string, and POSTs it to the CRM with the contractually-required retry and
 * idempotency semantics:
 *
 *   200 { ok: true }                  -> delivered
 *   200 { ok: true, duplicate: true } -> already received (success)
 *   400 invalid_payload / version     -> our bug; DO NOT retry, log + alert
 *   401 invalid_signature / stale     -> auth/clock bug; DO NOT retry, alert
 *   5xx / network                     -> retry 3× with 1s, 5s, 30s backoff
 *
 * The SAME event_id is reused across retries (it lives in the signed body),
 * which is what makes redelivery idempotent on the CRM side.
 *
 * SERVER-SIDE ONLY — depends on `CRM_WEBHOOK_SECRET`.
 */

import { logger } from '@/lib/utils/logger';
import { buildSignedHeaders } from './signer';
import { WEBHOOK_ENDPOINTS, type WebhookSurface } from './schemas';

export interface CRMClientEnv {
  CRM_WEBHOOK_SECRET?: string;
  CRM_BASE_URL?: string;
  CRM_COMPANY_ID?: string;
  /** Optional override for the `source` field; defaults to "website". */
  CRM_WEBHOOK_SOURCE?: string;
}

/**
 * Minimal fetch shape we depend on. Looser than the Workers-augmented global
 * `fetch` type so test mocks (and Node's fetch) assign without friction.
 */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export interface SendToCRMOptions {
  /** Stable idempotency key. Generated once per logical submission. */
  eventId?: string;
  /** Envelope `source`; defaults to env override or "website". */
  source?: string;
  /** Backoff schedule (ms). Overridable for tests. */
  retryDelaysMs?: number[];
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injectable sleep for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface SendToCRMResult {
  ok: boolean;
  duplicate?: boolean;
  status?: number;
  error?: string;
  /** True when the failure class is one the contract says to retry. */
  retriable?: boolean;
  eventId: string;
  /** Number of HTTP attempts made (1 = no retries). */
  attempts: number;
}

const DEFAULT_RETRY_DELAYS_MS = [1000, 5000, 30000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isCRMConfigured(env: CRMClientEnv): boolean {
  return Boolean(env.CRM_WEBHOOK_SECRET && env.CRM_BASE_URL && env.CRM_COMPANY_ID);
}

/** Generates a fresh event_id when the caller did not supply one. */
export function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Signs and delivers one event to the CRM, retrying on 5xx/network per the
 * contract. The event-specific `payload` is merged with the envelope; the
 * combined object is stringified exactly once and that string is both signed
 * and sent.
 */
export async function sendToCRM(
  env: CRMClientEnv,
  surface: WebhookSurface,
  payload: Record<string, unknown>,
  options: SendToCRMOptions = {},
): Promise<SendToCRMResult> {
  const eventId = options.eventId ?? newEventId();

  if (!isCRMConfigured(env)) {
    // Total lead loss if this ever happens in production (a misconfigured /
    // rotated dashboard secret silently drops EVERY CRM lead). Emit a
    // structured, severity-tagged line so the error pipeline / log alerting
    // escalates it instead of it sitting unnoticed in the log stream.
    logger.error('CRM', 'Not configured — skipping send (CRITICAL: leads being dropped)', { surface });
    console.error(JSON.stringify({
      __pipeline: 'error',
      code: 'CRM-CONFIG-001',
      severity: 'CRITICAL',
      message: 'CRM webhook not configured — leads are being dropped',
      source: 'crm/client',
      context: { surface },
      ts: new Date().toISOString(),
    }));
    return { ok: false, error: 'crm_not_configured', retriable: false, eventId, attempts: 0 };
  }

  const source = options.source ?? env.CRM_WEBHOOK_SOURCE ?? 'website';
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const sleep = options.sleepImpl ?? defaultSleep;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  const envelope = {
    event_id: eventId,
    source,
    company_id: env.CRM_COMPANY_ID,
    ...payload,
  };
  // Serialize ONCE — this exact string is what we sign and what we send.
  const rawBody = JSON.stringify(envelope);
  const url = `${env.CRM_BASE_URL}${WEBHOOK_ENDPOINTS[surface].path}`;

  // attempt 0 = first try; up to retryDelays.length retries after it.
  for (let attempt = 0; ; attempt++) {
    // Re-sign on every attempt: the timestamp must stay within the CRM's
    // ±300s window, and re-signing only changes the signature header — the
    // body (and thus event_id) is byte-identical across attempts.
    const headers = await buildSignedHeaders(env.CRM_WEBHOOK_SECRET as string, rawBody);

    try {
      const res = await fetchImpl(url, { method: 'POST', headers, body: rawBody });

      if (res.status === 200) {
        const data = (await res.json().catch(() => ({}))) as { duplicate?: boolean };
        if (data.duplicate) {
          logger.info('CRM', 'Duplicate (already received)', { surface, eventId });
        } else {
          logger.info('CRM', 'Delivered', { surface, eventId, attempts: attempt + 1 });
        }
        return { ok: true, duplicate: !!data.duplicate, status: 200, eventId, attempts: attempt + 1 };
      }

      if (res.status === 400 || res.status === 401) {
        const text = await res.text().catch(() => '');

        // A 401 caused by clock skew / an expired timestamp is TRANSIENT, not
        // a permanent bug: every attempt re-signs with a fresh timestamp, so a
        // retry very likely succeeds. Only a genuine invalid_signature /
        // invalid_payload is non-retriable. Distinguish by the response body.
        const lower = text.toLowerCase();
        const isStale = res.status === 401 && /stale|timestamp|clock|expired/.test(lower);

        if (isStale && attempt < retryDelays.length) {
          logger.warn('CRM', '401 stale timestamp — re-signing and retrying', {
            surface,
            eventId,
            attempt: attempt + 1,
            nextDelayMs: retryDelays[attempt],
          });
          await sleep(retryDelays[attempt]);
          continue;
        }

        // Our bug (bad payload / bad signature) or stale that exhausted
        // retries. Log loudly for alerting.
        logger.error('CRM', `Non-retriable ${res.status} — log + alert`, {
          surface,
          eventId,
          status: res.status,
          body: text.slice(0, 500),
        });
        return {
          ok: false,
          status: res.status,
          error: text.slice(0, 500) || `http_${res.status}`,
          retriable: isStale,
          eventId,
          attempts: attempt + 1,
        };
      }

      // Any other status (5xx, 429, unexpected) is retriable.
      if (attempt < retryDelays.length) {
        logger.warn('CRM', `Retriable ${res.status} — backing off`, {
          surface,
          eventId,
          attempt: attempt + 1,
          nextDelayMs: retryDelays[attempt],
        });
        await sleep(retryDelays[attempt]);
        continue;
      }
      logger.error('CRM', 'Exhausted retries', { surface, eventId, status: res.status });
      return {
        ok: false,
        status: res.status,
        error: `http_${res.status}`,
        retriable: true,
        eventId,
        attempts: attempt + 1,
      };
    } catch (err) {
      // Network error — retriable.
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < retryDelays.length) {
        logger.warn('CRM', 'Network error — backing off', {
          surface,
          eventId,
          attempt: attempt + 1,
          nextDelayMs: retryDelays[attempt],
          error: message,
        });
        await sleep(retryDelays[attempt]);
        continue;
      }
      logger.error('CRM', 'Exhausted retries (network)', { surface, eventId, error: message });
      return { ok: false, error: message, retriable: true, eventId, attempts: attempt + 1 };
    }
  }
}
