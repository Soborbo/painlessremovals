import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendGA4MP,
  deriveClientId,
  ga4ClientIdFromRequest,
  ga4SessionIdFromRequest,
  pageLocationFromRequest,
} from './server';

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
    expect(body.events).toEqual([
      { name: 'phone_conversion', params: { value: 5, engagement_time_msec: 1 } },
    ]);
  });

  it('stitches session_id and page_location into every event', async () => {
    await sendGA4MP(
      FULL_ENV,
      'cid.1',
      [{ name: 'quote_calculator_complete', params: { value: 500 } }],
      { sessionId: '1712345678', pageLocation: 'https://painlessremovals.com/instantquote/your-quote/' },
    );
    const params = lastBody().events[0].params;
    expect(params.session_id).toBe('1712345678');
    expect(params.page_location).toBe('https://painlessremovals.com/instantquote/your-quote/');
    expect(params.engagement_time_msec).toBe(1);
  });

  it('caller-provided event params win over option-derived ones', async () => {
    await sendGA4MP(
      FULL_ENV,
      'cid.1',
      [{ name: 'x', params: { session_id: 'explicit', engagement_time_msec: 100 } }],
      { sessionId: 'from-options' },
    );
    const params = lastBody().events[0].params;
    expect(params.session_id).toBe('explicit');
    expect(params.engagement_time_msec).toBe(100);
  });

  it('omits session_id / page_location when not provided', async () => {
    await sendGA4MP(FULL_ENV, 'cid.1', [{ name: 'x' }]);
    const params = lastBody().events[0].params;
    expect('session_id' in params).toBe(false);
    expect('page_location' in params).toBe(false);
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

describe('ga4SessionIdFromRequest', () => {
  const req = (cookie?: string) =>
    new Request('https://painlessremovals.com/api/x', {
      headers: cookie ? { Cookie: cookie } : {},
    });

  it('extracts session_id from a GS1 cookie (third segment)', () => {
    expect(
      ga4SessionIdFromRequest(req('_ga_05GFQ1XQFH=GS1.1.1712345678.5.1.1712345699.60.0.0'), 'G-05GFQ1XQFH'),
    ).toBe('1712345678');
  });

  it('extracts session_id from a GS2 cookie ($-delimited s-field)', () => {
    expect(
      ga4SessionIdFromRequest(req('_ga_05GFQ1XQFH=GS2.1.s1712345678$o5$g1$t1712345699$j60$l0$h0'), 'G-05GFQ1XQFH'),
    ).toBe('1712345678');
  });

  it('matches the stream cookie for the given measurement id, not others', () => {
    const cookie = '_ga_OTHER=GS2.1.s9999999999$o1; _ga_05GFQ1XQFH=GS2.1.s1712345678$o5';
    expect(ga4SessionIdFromRequest(req(cookie), 'G-05GFQ1XQFH')).toBe('1712345678');
  });

  it('falls back to any _ga_* cookie when no measurement id is given', () => {
    expect(
      ga4SessionIdFromRequest(req('foo=bar; _ga_ABC123=GS2.1.s1700000000$o2')),
    ).toBe('1700000000');
  });

  it('ignores the plain _ga client cookie', () => {
    expect(ga4SessionIdFromRequest(req('_ga=GA1.1.123.456'), 'G-05GFQ1XQFH')).toBeUndefined();
  });

  it('returns undefined when there is no Cookie header', () => {
    expect(ga4SessionIdFromRequest(req(), 'G-05GFQ1XQFH')).toBeUndefined();
  });

  it('returns undefined for a malformed stream cookie', () => {
    expect(ga4SessionIdFromRequest(req('_ga_05GFQ1XQFH=garbage'), 'G-05GFQ1XQFH')).toBeUndefined();
  });
});

describe('pageLocationFromRequest', () => {
  it('returns the same-origin Referer as page_location', () => {
    const request = new Request('https://painlessremovals.com/api/save-quote', {
      headers: { Referer: 'https://painlessremovals.com/instantquote/your-quote/' },
    });
    expect(pageLocationFromRequest(request)).toBe('https://painlessremovals.com/instantquote/your-quote/');
  });

  it('returns undefined when Referer is missing or non-http', () => {
    expect(pageLocationFromRequest(new Request('https://painlessremovals.com/api/x'))).toBeUndefined();
    expect(
      pageLocationFromRequest(
        new Request('https://painlessremovals.com/api/x', { headers: { Referer: 'android-app://foo' } }),
      ),
    ).toBeUndefined();
  });
});
