import { describe, it, expect, vi } from 'vitest';
import { sendToCRMWithMirror, resolveMirrorEnv, type DualCRMClientEnv } from './client';

/**
 * Parallel-run dual-send (phase9b). The mirror MUST be fully isolated from the
 * primary: same event_id to both, but the secondary can fail/throw/hang without
 * ever changing the returned primary result. These tests pin that contract.
 */

const PRIMARY: DualCRMClientEnv = {
  CRM_WEBHOOK_SECRET: 'primary-secret-32-chars-minimum-aaaa',
  CRM_BASE_URL: 'https://crm.primary',
  CRM_COMPANY_ID: '11111111-1111-1111-1111-111111111111',
};

const WITH_MIRROR: DualCRMClientEnv = {
  ...PRIMARY,
  CRM_BASE_URL_2: 'https://crm.secondary',
  CRM_WEBHOOK_SECRET_2: 'secondary-secret-32-chars-min-bbbb',
};

const PAYLOAD = {
  customer: { full_name: 'Jane Doe', email: 'jane@example.com', phone: '+447700900123' },
};

const fast = { retryDelaysMs: [0, 0, 0], sleepImpl: async () => {} };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Routes the shared fetch mock by target host so we can assert per-CRM behavior. */
function routedFetch(handlers: { primary: () => Response | Promise<Response>; secondary: () => Response | Promise<Response> }) {
  return vi.fn(async (url: string) => {
    return url.startsWith('https://crm.secondary') ? handlers.secondary() : handlers.primary();
  });
}

describe('resolveMirrorEnv', () => {
  it('returns null when the mirror is not configured', () => {
    expect(resolveMirrorEnv(PRIMARY)).toBeNull();
  });

  it('returns null when only one of the two required vars is set', () => {
    expect(resolveMirrorEnv({ ...PRIMARY, CRM_BASE_URL_2: 'https://crm.secondary' })).toBeNull();
    expect(resolveMirrorEnv({ ...PRIMARY, CRM_WEBHOOK_SECRET_2: 'x-32-chars-minimum-secret-aaaaaaaa' })).toBeNull();
  });

  it('maps _2 vars and falls back company_id/source to the primary', () => {
    const m = resolveMirrorEnv(WITH_MIRROR);
    expect(m).toEqual({
      CRM_BASE_URL: 'https://crm.secondary',
      CRM_WEBHOOK_SECRET: 'secondary-secret-32-chars-min-bbbb',
      CRM_COMPANY_ID: PRIMARY.CRM_COMPANY_ID,
      CRM_WEBHOOK_SOURCE: undefined,
    });
  });

  it('honours explicit _2 overrides for company_id/source', () => {
    const m = resolveMirrorEnv({
      ...WITH_MIRROR,
      CRM_COMPANY_ID_2: '22222222-2222-2222-2222-222222222222',
      CRM_WEBHOOK_SOURCE_2: 'website_shadow',
    });
    expect(m?.CRM_COMPANY_ID).toBe('22222222-2222-2222-2222-222222222222');
    expect(m?.CRM_WEBHOOK_SOURCE).toBe('website_shadow');
  });
});

describe('sendToCRMWithMirror', () => {
  it('with no mirror configured, hits ONLY the primary', async () => {
    const fetchImpl = routedFetch({
      primary: () => jsonResponse(200, { ok: true }),
      secondary: () => jsonResponse(200, { ok: true }),
    });
    const res = await sendToCRMWithMirror(PRIMARY, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-solo-1' });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('crm.primary');
  });

  it('mirrors the SAME event_id + body to both CRMs', async () => {
    const bodies: Record<string, { url: string; event_id: string; customer: unknown }> = {};
    const fetchImpl = vi.fn(async (url: string, init: { body: string }) => {
      const parsed = JSON.parse(init.body) as { event_id: string; customer: unknown };
      bodies[url.startsWith('https://crm.secondary') ? 'secondary' : 'primary'] = { url, ...parsed };
      return jsonResponse(200, { ok: true });
    });
    const res = await sendToCRMWithMirror(WITH_MIRROR, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-mirror-1' });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies.primary.event_id).toBe('evt-mirror-1');
    expect(bodies.secondary.event_id).toBe('evt-mirror-1');
    expect(bodies.secondary.customer).toEqual(PAYLOAD.customer);
  });

  it('generates ONE shared event_id when the caller supplies none', async () => {
    const ids: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      ids.push((JSON.parse(init.body) as { event_id: string }).event_id);
      return jsonResponse(200, { ok: true });
    });
    await sendToCRMWithMirror(WITH_MIRROR, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });

  it('returns the PRIMARY result even when the mirror fails (5xx exhausted)', async () => {
    const fetchImpl = routedFetch({
      primary: () => jsonResponse(200, { ok: true }),
      secondary: () => jsonResponse(503, { error: 'unavailable' }),
    });
    const res = await sendToCRMWithMirror(WITH_MIRROR, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-mfail-1' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    // primary once + secondary 4 attempts (1 + 3 retries)
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('returns the PRIMARY result even when the mirror THROWS on every attempt', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://crm.secondary')) throw new Error('mirror network down');
      return jsonResponse(200, { ok: true });
    });
    const res = await sendToCRMWithMirror(WITH_MIRROR, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-mthrow-1' });
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(false);
  });

  it('a primary FAILURE still surfaces as the result, and the mirror still fired', async () => {
    const secondaryCalls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://crm.secondary')) {
        secondaryCalls.push(url);
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(400, { error: 'invalid_payload' });
    });
    const res = await sendToCRMWithMirror(WITH_MIRROR, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-pfail-1' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.retriable).toBe(false);
    // The mirror is independent: it delivered even though the primary 400'd.
    expect(secondaryCalls.length).toBe(1);
  });
});
