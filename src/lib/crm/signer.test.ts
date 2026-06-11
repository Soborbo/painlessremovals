import { describe, it, expect } from 'vitest';
import { signWebhook, buildSignedHeaders, WEBHOOK_VERSION } from './signer';

/**
 * Known-answer vector. If this test breaks, the signature has DRIFTED from
 * what the CRM verifier computes — do not "fix" it by updating the hex
 * unless the CRM's canonical base string actually changed. The expected hex
 * was produced independently with Node's crypto.createHmac over the exact
 * base string `${timestamp}.${version}.${rawBody}`.
 */
const SECRET = 'test-shared-secret-32-chars-min-aaaa';
const TIMESTAMP = 1700000000;
const RAW_BODY = JSON.stringify({
  event_id: 'evt-12345678',
  source: 'website',
  company_id: '11111111-1111-1111-1111-111111111111',
  customer: { full_name: 'Jane Doe', email: 'jane@example.com', phone: '+447700900123' },
});
const EXPECTED_HEX = 'e6126ddf37152b55485001d36b7f892d193a54ad3be1185a16cccd45a9a8f136';

describe('signWebhook', () => {
  it('matches the known HMAC-SHA256 vector (must not drift from CRM verifier)', async () => {
    const hex = await signWebhook(SECRET, RAW_BODY, TIMESTAMP, WEBHOOK_VERSION);
    expect(hex).toBe(EXPECTED_HEX);
  });

  it('produces lowercase hex of 64 chars', async () => {
    const hex = await signWebhook(SECRET, RAW_BODY, TIMESTAMP);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the body changes', async () => {
    const a = await signWebhook(SECRET, RAW_BODY, TIMESTAMP);
    const b = await signWebhook(SECRET, RAW_BODY + ' ', TIMESTAMP);
    expect(a).not.toBe(b);
  });

  it('changes when the timestamp changes', async () => {
    const a = await signWebhook(SECRET, RAW_BODY, TIMESTAMP);
    const b = await signWebhook(SECRET, RAW_BODY, TIMESTAMP + 1);
    expect(a).not.toBe(b);
  });
});

describe('buildSignedHeaders', () => {
  it('builds the full header set with the sha256= prefix', async () => {
    const headers = await buildSignedHeaders(SECRET, RAW_BODY, { timestamp: TIMESTAMP });
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-webhook-version']).toBe('1.0');
    expect(headers['x-webhook-timestamp']).toBe(String(TIMESTAMP));
    expect(headers['x-webhook-signature']).toBe(`sha256=${EXPECTED_HEX}`);
  });

  it('defaults the timestamp to now (integer seconds)', async () => {
    const before = Math.floor(Date.now() / 1000);
    const headers = await buildSignedHeaders(SECRET, RAW_BODY);
    const ts = Number(headers['x-webhook-timestamp']);
    expect(Number.isInteger(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});
