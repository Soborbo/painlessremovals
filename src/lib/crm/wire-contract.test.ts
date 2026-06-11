import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { sendToCRM, type CRMClientEnv } from './client';

/**
 * End-to-end wire-contract proof WITHOUT real CRM credentials.
 *
 * `mockCrmReceiver` re-implements the CRM's inbound verification using Node's
 * crypto (an INDEPENDENT implementation from our WebCrypto signer). If our
 * real `sendToCRM` output passes this verifier, the signing, headers, canonical
 * base string, and envelope are byte-compatible with what the CRM expects.
 *
 * This is the strongest connection test available offline; the live check is
 * `roundtrip.staging.test.ts` (needs the shared secret).
 */

const SECRET = 'test-shared-secret-32-chars-min-aaaa';
const ENV: CRMClientEnv = {
  CRM_WEBHOOK_SECRET: SECRET,
  CRM_BASE_URL: 'https://crm.mock',
  CRM_COMPANY_ID: '11111111-1111-1111-1111-111111111111',
};

const fast = { retryDelaysMs: [0, 0, 0], sleepImpl: async () => {} };

/** Mirrors the CRM receiver: verify signature, timestamp window, version. */
function makeMockReceiver(seen = new Set<string>()) {
  return async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    const headers = init.headers;
    const sigHeader = headers['x-webhook-signature'] || '';
    const ts = headers['x-webhook-timestamp'] || '';
    const version = headers['x-webhook-version'] || '';
    const rawBody = init.body;

    // 1. Version allow-list.
    if (version !== '1.0') {
      return new Response(JSON.stringify({ error: 'unsupported_schema_version' }), { status: 400 });
    }
    // 2. Timestamp window ±300s.
    const tsNum = Number(ts);
    if (!Number.isInteger(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) {
      return new Response(JSON.stringify({ error: 'stale_timestamp' }), { status: 401 });
    }
    // 3. Signature: HMAC-SHA256 over `${ts}.${version}.${rawBody}` (the
    //    "sha256=" prefix is accepted). Independent re-computation.
    const expected = createHmac('sha256', SECRET).update(`${ts}.${version}.${rawBody}`).digest('hex');
    const provided = sigHeader.replace(/^sha256=/, '');
    if (provided !== expected) {
      return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 401 });
    }
    // 4. Body must be valid JSON with the required envelope.
    let parsed: { event_id?: string; source?: string; company_id?: string };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400 });
    }
    if (!parsed.event_id || !parsed.source || !parsed.company_id) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400 });
    }
    // 5. Idempotency by event_id.
    if (seen.has(parsed.event_id)) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
    }
    seen.add(parsed.event_id);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
}

const CONTACT = {
  customer: { full_name: 'Jane Doe', email: 'jane@example.com', phone: '+447700900123' },
  message: 'Wire-contract test',
};

describe('CRM wire contract (independent verifier)', () => {
  it('a signed request is ACCEPTED by an independent CRM-style verifier', async () => {
    const fetchImpl = makeMockReceiver();
    const res = await sendToCRM(ENV, 'contact', CONTACT, { ...fast, fetchImpl, eventId: 'evt-accept-1' });
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(false);
    expect(res.status).toBe(200);
  });

  it('a resend of the same event_id is reported as duplicate (idempotent)', async () => {
    const seen = new Set<string>();
    const fetchImpl = makeMockReceiver(seen);
    const first = await sendToCRM(ENV, 'contact', CONTACT, { ...fast, fetchImpl, eventId: 'evt-dupe-1' });
    const second = await sendToCRM(ENV, 'contact', CONTACT, { ...fast, fetchImpl, eventId: 'evt-dupe-1' });
    expect(first.ok).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
  });

  it('a tampered body is REJECTED (401) and not retried', async () => {
    const inner = makeMockReceiver();
    let calls = 0;
    // Mutate the body in flight so the signature no longer matches.
    const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls++;
      return inner(url, { ...init, body: init.body.replace('Jane Doe', 'Mallory') });
    };
    const res = await sendToCRM(ENV, 'contact', CONTACT, { ...fast, fetchImpl, eventId: 'evt-tamper-1' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.retriable).toBe(false);
    expect(calls).toBe(1); // no retry on auth failure
  });

  it('a wrong secret produces an invalid signature the CRM rejects', async () => {
    const fetchImpl = makeMockReceiver();
    const res = await sendToCRM(
      { ...ENV, CRM_WEBHOOK_SECRET: 'the-wrong-secret-value-not-matching-x' },
      'contact',
      CONTACT,
      { ...fast, fetchImpl, eventId: 'evt-wrongsecret-1' },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});
