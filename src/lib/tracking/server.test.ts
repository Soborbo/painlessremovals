import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { sendMetaCapi, sendGA4MP, deriveClientId, type MetaCapiEvent } from './server';

/**
 * Regression net for the server-side egress (CLAUDE.md rules #7, #8 + dedup).
 *
 * The hashes are cross-checked against Node's own crypto.sha256 — if the
 * @noble implementation ever diverged from what Meta hashes on its side,
 * these break. Phone MUST be hashed digits-only (no leading +): feeding the
 * full E.164 string was a real match-quality bug, locked here.
 */

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');

const FULL_ENV = {
  META_PIXEL_ID: '1112223334',
  META_CAPI_ACCESS_TOKEN: 'tok_secret',
  GA4_MEASUREMENT_ID: 'G-05GFQ1XQFH',
  GA4_API_SECRET: 'ga4_secret',
};

let fetchMock: ReturnType<typeof vi.fn>;

function lastBody(): any {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  return JSON.parse((call[1] as RequestInit).body as string);
}
function lastUrl(): string {
  return String(fetchMock.mock.calls.at(-1)![0]);
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const baseEvent = (over: Partial<MetaCapiEvent> = {}): MetaCapiEvent => ({
  event_name: 'quote_calculator_conversion',
  event_id: 'evt_abc12345',
  event_time: 1_750_000_000,
  ...over,
});

describe('sendMetaCapi — credential gating', () => {
  it('does not call fetch when pixel_id is missing', async () => {
    await sendMetaCapi({ META_CAPI_ACCESS_TOKEN: 'tok' }, [baseEvent()]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call fetch when access_token is missing', async () => {
    await sendMetaCapi({ META_PIXEL_ID: '123' }, [baseEvent()]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call fetch for a fully-empty env', async () => {
    await sendMetaCapi({}, [baseEvent()]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendMetaCapi — request shape', () => {
  it('POSTs to the graph.facebook.com pixel/events endpoint with the token', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent()]);
    const url = lastUrl();
    expect(url).toContain('graph.facebook.com/');
    expect(url).toContain('/1112223334/events');
    expect(url).toContain('access_token=tok_secret');
  });

  it('uses Meta Graph API version v22.0', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent()]);
    expect(lastUrl()).toContain('/v22.0/');
  });

  it('wraps events under a data[] array', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent(), baseEvent({ event_id: 'evt_two00001' })]);
    const body = lastBody();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('passes event_id through verbatim (browser↔CAPI dedup key)', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ event_id: 'evt_dedup999' })]);
    expect(lastBody().data[0].event_id).toBe('evt_dedup999');
  });

  it('passes event_name and event_time through', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ event_name: 'phone_conversion', event_time: 1_750_000_123 })]);
    const e = lastBody().data[0];
    expect(e.event_name).toBe('phone_conversion');
    expect(e.event_time).toBe(1_750_000_123);
  });

  it('defaults action_source to "website"', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent()]);
    expect(lastBody().data[0].action_source).toBe('website');
  });

  it('respects an explicit action_source', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ action_source: 'website' })]);
    expect(lastBody().data[0].action_source).toBe('website');
  });

  it('forwards custom_data', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ custom_data: { value: 1200, currency: 'GBP' } })]);
    expect(lastBody().data[0].custom_data).toEqual({ value: 1200, currency: 'GBP' });
  });

  it('includes test_event_code when configured', async () => {
    await sendMetaCapi({ ...FULL_ENV, META_CAPI_TEST_EVENT_CODE: 'TEST123' }, [baseEvent()]);
    expect(lastBody().test_event_code).toBe('TEST123');
  });

  it('omits test_event_code when not configured', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent()]);
    expect(lastBody().test_event_code).toBeUndefined();
  });
});

describe('sendMetaCapi — user_data hashing', () => {
  it('hashes email as SHA-256 of lowercased/trimmed value, wrapped in an array', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { email: '  John@Example.COM ' } })]);
    expect(lastBody().data[0].user_data.em).toEqual([sha256hex('john@example.com')]);
  });

  it('hashes phone DIGITS-ONLY (no leading +) — the locked match-quality fix', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { phone_number: '+44 7700 900123' } })]);
    // normalizePhoneE164 → +447700900123 → strip + → 447700900123 → sha256
    expect(lastBody().data[0].user_data.ph).toEqual([sha256hex('447700900123')]);
  });

  it('normalizes + hashes phone per the country code (HU)', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { phone_number: '06201234567' } })], 'HU');
    expect(lastBody().data[0].user_data.ph).toEqual([sha256hex('36201234567')]);
  });

  it('hashes first and last name lowercased', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { first_name: 'JOHN', last_name: 'Smith' } })]);
    const ud = lastBody().data[0].user_data;
    expect(ud.fn).toEqual([sha256hex('john')]);
    expect(ud.ln).toEqual([sha256hex('smith')]);
  });

  it('hashes city lowercased', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { city: 'Bristol' } })]);
    expect(lastBody().data[0].user_data.ct).toEqual([sha256hex('bristol')]);
  });

  it('hashes postal code uppercased with spaces removed', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { postal_code: 'bs1 2ab' } })]);
    expect(lastBody().data[0].user_data.zp).toEqual([sha256hex('BS12AB')]);
  });

  it('hashes country as the lowercased 2-letter code', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { country: 'GB' } })]);
    expect(lastBody().data[0].user_data.country).toEqual([sha256hex('gb')]);
  });

  it('passes fbp / fbc / client_user_agent / client_ip_address through UNHASHED', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({
      user_data: {
        fbp: 'fb.1.123.456',
        fbc: 'fb.1.123.click',
        client_user_agent: 'Mozilla/5.0',
        client_ip_address: '203.0.113.7',
      },
    })]);
    const ud = lastBody().data[0].user_data;
    expect(ud.fbp).toBe('fb.1.123.456');
    expect(ud.fbc).toBe('fb.1.123.click');
    expect(ud.client_user_agent).toBe('Mozilla/5.0');
    expect(ud.client_ip_address).toBe('203.0.113.7');
  });

  it('omits absent PII fields from the sent payload (undefined dropped by JSON)', async () => {
    await sendMetaCapi(FULL_ENV, [baseEvent({ user_data: { email: 'a@b.com' } })]);
    const ud = lastBody().data[0].user_data;
    expect(ud.em).toBeDefined();
    expect('ph' in ud).toBe(false);
    expect('fn' in ud).toBe(false);
    expect('zp' in ud).toBe(false);
  });
});

describe('sendMetaCapi — failure handling (best-effort, never throws)', () => {
  it('resolves without throwing when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(sendMetaCapi(FULL_ENV, [baseEvent()])).resolves.toBeUndefined();
  });

  it('resolves without throwing on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' });
    await expect(sendMetaCapi(FULL_ENV, [baseEvent()])).resolves.toBeUndefined();
  });
});

describe('sendGA4MP', () => {
  it('does not call fetch when measurement_id is missing', async () => {
    await sendGA4MP({ GA4_API_SECRET: 's' }, 'cid.1', [{ name: 'x' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call fetch when api_secret is missing', async () => {
    await sendGA4MP({ GA4_MEASUREMENT_ID: 'G-1' }, 'cid.1', [{ name: 'x' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to the MP collect endpoint with measurement_id + api_secret', async () => {
    await sendGA4MP(FULL_ENV, 'cid.1', [{ name: 'phone_conversion' }]);
    const url = lastUrl();
    expect(url).toContain('https://www.google-analytics.com/mp/collect');
    expect(url).toContain('measurement_id=G-05GFQ1XQFH');
    expect(url).toContain('api_secret=ga4_secret');
  });

  it('sends client_id and events in the body', async () => {
    await sendGA4MP(FULL_ENV, 'cid.123', [{ name: 'phone_conversion', params: { value: 5 } }]);
    const body = lastBody();
    expect(body.client_id).toBe('cid.123');
    expect(body.events).toEqual([{ name: 'phone_conversion', params: { value: 5 } }]);
  });

  it('includes user_id only when provided', async () => {
    await sendGA4MP(FULL_ENV, 'cid.1', [{ name: 'x' }], { userId: 'u-9' });
    expect(lastBody().user_id).toBe('u-9');
  });

  it('omits user_id when not provided', async () => {
    await sendGA4MP(FULL_ENV, 'cid.1', [{ name: 'x' }]);
    expect('user_id' in lastBody()).toBe(false);
  });

  it('never throws when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(sendGA4MP(FULL_ENV, 'cid.1', [{ name: 'x' }])).resolves.toBeUndefined();
  });
});

describe('deriveClientId', () => {
  it('derives a stable numeric.timestamp id from a hex fingerprint', () => {
    // parseInt('abcdef12', 16) === 2882400018
    expect(deriveClientId('abcdef1234567890')).toMatch(/^2882400018\.\d+$/);
  });

  it('falls back to a random id for an empty fingerprint', () => {
    expect(deriveClientId('')).toMatch(/^\d+\.\d+$/);
  });

  it('falls back to a random id for a too-short fingerprint', () => {
    expect(deriveClientId('abc')).toMatch(/^\d+\.\d+$/);
  });

  it('falls back to a random id when the first 8 chars are not hex', () => {
    expect(deriveClientId('zzzzzzzzzzzz')).toMatch(/^\d+\.\d+$/);
  });

  it('is stable in its leading segment for the same fingerprint', () => {
    const a = deriveClientId('deadbeefcafe0000').split('.')[0];
    const b = deriveClientId('deadbeefcafe0000').split('.')[0];
    expect(a).toBe(b);
  });
});
