import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendGA4MP, deriveClientId, ga4ClientIdFromRequest } from './server';

/**
 * Regression net for the server-side egress (GA4 Measurement Protocol).
 *
 * Meta CAPI is no longer sent from this codebase — the Soborbo
 * event-gateway Worker owns the server-side Meta leg (hashing included);
 * `sendMetaCapi` and its hashing tests were removed at cutover
 * (docs/gateway-golive.md §6).
 */

const FULL_ENV = {
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

describe('ga4ClientIdFromRequest', () => {
  const req = (cookie?: string) =>
    new Request('https://painlessremovals.com/api/x', {
      headers: cookie ? { Cookie: cookie } : {},
    });

  it('extracts the client_id (last two segments) from a GA1.1 cookie', () => {
    expect(ga4ClientIdFromRequest(req('_ga=GA1.1.123456789.1700000000')))
      .toBe('123456789.1700000000');
  });

  it('handles GA1.2 / domain-level variants via slice(-2)', () => {
    expect(ga4ClientIdFromRequest(req('_ga=GA1.2.987654321.1699999999')))
      .toBe('987654321.1699999999');
  });

  it('finds _ga among other cookies', () => {
    expect(ga4ClientIdFromRequest(req('foo=bar; _ga=GA1.1.11.22; _ga_ABC=GS2.1.s123')))
      .toBe('11.22');
  });

  it('does NOT match the _ga_<STREAM> session cookie as _ga', () => {
    expect(ga4ClientIdFromRequest(req('_ga_ABC123=GS2.1.s1700000000$o5$g1')))
      .toBeUndefined();
  });

  it('returns undefined when there is no Cookie header', () => {
    expect(ga4ClientIdFromRequest(req())).toBeUndefined();
  });

  it('returns undefined for a malformed _ga cookie', () => {
    expect(ga4ClientIdFromRequest(req('_ga=garbage'))).toBeUndefined();
    expect(ga4ClientIdFromRequest(req('_ga=GA1.1.abc.def'))).toBeUndefined();
  });
});
