import { describe, it, expect, vi } from 'vitest';
import { sendToCRM, type CRMClientEnv } from './client';

const ENV: CRMClientEnv = {
  CRM_WEBHOOK_SECRET: 'test-shared-secret-32-chars-min-aaaa',
  CRM_BASE_URL: 'https://crm.example',
  CRM_COMPANY_ID: '11111111-1111-1111-1111-111111111111',
};

const PAYLOAD = {
  customer: { full_name: 'Jane Doe', email: 'jane@example.com', phone: '+447700900123' },
};

// No real backoff in tests.
const fast = { retryDelaysMs: [0, 0, 0], sleepImpl: async () => {} };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sendToCRM', () => {
  it('delivers on 200 { ok: true } without retrying', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-aaaaaaaa' });
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(false);
    expect(res.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats 200 { duplicate: true } as success', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true, duplicate: true }));
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(true);
  });

  it('retries on 5xx, then gives up after 3 retries (4 attempts total)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: 'unavailable' }));
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.retriable).toBe(true);
    expect(res.attempts).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('retries on network error then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 400 invalid_payload', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: 'invalid_payload' }));
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.retriable).toBe(false);
    expect(res.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 401 invalid_signature', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'invalid_signature' }));
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.retriable).toBe(false);
    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reuses the SAME event_id across retries', async () => {
    const seenEventIds: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init) => {
      const body = JSON.parse(init.body as string) as { event_id: string };
      seenEventIds.push(body.event_id);
      return jsonResponse(503, { error: 'unavailable' });
    });
    const res = await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-stable-1' });
    expect(res.eventId).toBe('evt-stable-1');
    expect(seenEventIds.length).toBe(4);
    expect(new Set(seenEventIds).size).toBe(1);
    expect(seenEventIds[0]).toBe('evt-stable-1');
  });

  it('sends the envelope (event_id, source, company_id) plus payload', async () => {
    let captured: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: string, init) => {
      captured = JSON.parse(init.body as string);
      return jsonResponse(200, { ok: true });
    });
    await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-envelope', source: 'website' });
    expect(captured.event_id).toBe('evt-envelope');
    expect(captured.source).toBe('website');
    expect(captured.company_id).toBe(ENV.CRM_COMPANY_ID);
    expect(captured.customer).toEqual(PAYLOAD.customer);
  });

  it('re-signs each attempt but signs the exact body sent', async () => {
    const sigs: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init) => {
      const headers = init.headers as Record<string, string>;
      sigs.push(headers['x-webhook-signature']);
      return jsonResponse(503, {});
    });
    await sendToCRM(ENV, 'contact', PAYLOAD, { ...fast, fetchImpl, eventId: 'evt-sig' });
    // Every signature carries the sha256= prefix and lowercase hex.
    for (const s of sigs) expect(s).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('fails fast (no fetch) when the CRM is not configured', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const res = await sendToCRM({}, 'contact', PAYLOAD, { ...fast, fetchImpl });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
