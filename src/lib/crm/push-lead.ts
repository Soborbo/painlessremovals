/**
 * Browser-side CRM lead pusher.
 *
 * Posts an already-shaped event body to the same-origin `/api/leads/*`
 * endpoint, which signs and forwards it to the CRM. This module carries NO
 * secret — signing happens entirely on the server endpoint.
 *
 * Design contract from the form side:
 *  - Forms call this in PARALLEL with their primary submit and DO NOT block
 *    success UX on the result (CRM delivery may still be retrying).
 *  - A stable `event_id` is generated once per submission (idempotency key)
 *    and reused if the caller retries.
 */

export type LeadSurface =
  | 'quote'
  | 'contact'
  | 'callback'
  | 'clearance-callback'
  | 'affiliate'
  | 'partner-register';

export interface PushLeadResult {
  ok: boolean;
  event_id: string;
  error?: string;
  issues?: Array<{ path: string; message: string }>;
}

/** Generates a stable idempotency key for one logical submission. */
export function newLeadEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Fire a lead at its `/api/leads/*` endpoint. Resolves (never rejects) with a
 * structured result so callers can `void`-call it without unhandled
 * rejections. Pass a stable `eventId` to make the call idempotent on retry.
 */
export async function pushLeadToCRM(
  surface: LeadSurface,
  payload: Record<string, unknown>,
  eventId: string = newLeadEventId(),
): Promise<PushLeadResult> {
  try {
    const res = await fetch(`/api/leads/${surface}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...payload }),
      // Keep the request alive if the page navigates away on success.
      keepalive: true,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<PushLeadResult> & {
      ok?: boolean;
    };
    return {
      ok: res.ok && data.ok !== false,
      event_id: data.event_id || eventId,
      error: data.error,
      issues: data.issues,
    };
  } catch (err) {
    return { ok: false, event_id: eventId, error: err instanceof Error ? err.message : String(err) };
  }
}
