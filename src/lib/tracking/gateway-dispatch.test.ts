import { describe, it, expect, vi } from 'vitest';
import {
  buildGatewayPayload,
  sendGatewayConversion,
  isGatewayConfigured,
  gatewayBaseUrl,
  splitFullName,
  resolveTestEventCode,
  type GatewayEnv,
  type GatewayConversionInput,
} from './gateway-dispatch';

/**
 * The server-side conversion leg. These lock the invariants that, if they drift,
 * fail SILENTLY in production (no exception, no failing build — just wrong or
 * missing numbers in Meta):
 *   - the browser's event_id must be the one we send (else Meta double-counts),
 *   - value: 0 must never be sent (CLAUDE.md #3 — it skews ROAS),
 *   - the real end-user IP/UA must be forwarded, not our Worker's,
 *   - auth must ride on X-Admin-Token and NO turnstile_token may be sent,
 *   - a misconfigured gateway (401/403/404) must not be retried into oblivion.
 */

const env: GatewayEnv = {
  TRACKING_GATEWAY_TOKEN: 'per-site-token',
  SITE_URL: 'https://painlessremovals.com',
};

const baseInput: GatewayConversionInput = {
  eventName: 'quote_calculator_submitted',
  eventId: 'a1b2c3d4-0000-4000-8000-000000000001',
  value: 850,
  currency: 'GBP',
  service: 'removal',
  userData: { email: 'Jane@Email.com', phone_number: '07123 456789' },
};

function okFetch(captured: { url?: string; init?: any }) {
  return vi.fn(async (url: string, init: any) => {
    captured.url = url;
    captured.init = init;
    return new Response(null, { status: 204 });
  });
}

describe('gateway config', () => {
  it('is unconfigured without a token → dispatch must no-op, not throw', () => {
    expect(isGatewayConfigured({ SITE_URL: 'https://x.com' })).toBe(false);
    expect(isGatewayConfigured(env)).toBe(true);
  });

  it('strips trailing slashes so the URL never becomes //api/event/conversion', () => {
    expect(gatewayBaseUrl({ SITE_URL: 'https://painlessremovals.com/' })).toBe(
      'https://painlessremovals.com',
    );
  });

  it('TRACKING_GATEWAY_URL overrides SITE_URL', () => {
    expect(
      gatewayBaseUrl({ SITE_URL: 'https://a.com', TRACKING_GATEWAY_URL: 'https://b.com' }),
    ).toBe('https://b.com');
  });
});

describe('buildGatewayPayload', () => {
  it('sends NO turnstile_token (the per-site token is the auth)', () => {
    expect(buildGatewayPayload(baseInput)).not.toHaveProperty('turnstile_token');
  });

  it('carries the browser event_id verbatim (Meta dedupes on it)', () => {
    const p = buildGatewayPayload(baseInput);
    expect(p.event_id).toBe('a1b2c3d4-0000-4000-8000-000000000001');
  });

  it('OMITS value AND currency when there is no money value (never value: 0)', () => {
    const p = buildGatewayPayload({
      eventName: 'callback_request_submitted',
      eventId: 'e1',
      value: 0,
      currency: 'GBP',
    });
    expect(p).not.toHaveProperty('value');
    expect(p).not.toHaveProperty('currency');

    const noValue = buildGatewayPayload({ eventName: 'callback_request_submitted', eventId: 'e1' });
    expect(noValue).not.toHaveProperty('value');
  });

  it('keeps a real value with its currency', () => {
    const p = buildGatewayPayload(baseInput);
    expect(p.value).toBe(850);
    expect(p.currency).toBe('GBP');
  });

  it('sends RAW PII — the gateway is the single normalizer (CLAUDE.md #1)', () => {
    const p = buildGatewayPayload(baseInput) as any;
    expect(p.user_data.email).toBe('Jane@Email.com');
    expect(p.user_data.phone_number).toBe('07123 456789');
  });

  it('drops empty strings so we never ship blank PII fields', () => {
    const p = buildGatewayPayload({
      eventName: 'callback_request_submitted',
      eventId: 'e1',
      userData: { email: '', phone_number: '0790' },
    }) as any;
    expect(p.user_data).toEqual({ phone_number: '0790' });
  });

  it('omits user_data entirely when every field is empty', () => {
    const p = buildGatewayPayload({
      eventName: 'callback_request_submitted',
      eventId: 'e1',
      userData: { email: '', phone_number: undefined },
    });
    expect(p).not.toHaveProperty('user_data');
  });

  it('forwards the real end-user ip/ua', () => {
    const p = buildGatewayPayload({
      ...baseInput,
      clientIpAddress: '203.0.113.9',
      clientUserAgent: 'Mozilla/5.0 (iPhone)',
    });
    expect(p.client_ip_address).toBe('203.0.113.9');
    expect(p.client_user_agent).toBe('Mozilla/5.0 (iPhone)');
  });

  it('carries lead_id so the ledger row joins the CRM lead record', () => {
    const p = buildGatewayPayload({ ...baseInput, leadId: 'cb-deadbeef' });
    expect(p.lead_id).toBe('cb-deadbeef');
  });
});

describe('splitFullName', () => {
  it('splits on the first space and keeps multi-word surnames intact', () => {
    expect(splitFullName('Jane Smith')).toEqual({ first_name: 'Jane', last_name: 'Smith' });
    expect(splitFullName('Jane van der Berg')).toEqual({
      first_name: 'Jane',
      last_name: 'van der Berg',
    });
    expect(splitFullName('Cher')).toEqual({ first_name: 'Cher' });
    expect(splitFullName('  ')).toEqual({});
    expect(splitFullName(undefined)).toEqual({});
  });
});

describe('sendGatewayConversion', () => {
  it('POSTs to the SERVER route (WAF-exempt), not the browser one', async () => {
    const captured: { url?: string; init?: any } = {};
    const res = await sendGatewayConversion(env, baseInput, { fetchImpl: okFetch(captured) as any });

    expect(res.ok).toBe(true);
    // Must NOT be `/api/event/conversion` — that path is what the zone's WAF
    // rate-limiting rule throttles. Sending money conversions there would put them
    // behind an IP-keyed limit they all share (single Worker egress IP).
    expect(captured.url).toBe('https://painlessremovals.com/api/event/conversion-server');
    expect(captured.init.method).toBe('POST');
    expect(captured.init.headers['x-admin-token']).toBe('per-site-token');
    // The token must never leak into the body.
    expect(captured.init.body).not.toContain('per-site-token');
  });

  it('treats 204 as success (the gateway always answers 204 — CLAUDE.md #12)', async () => {
    const res = await sendGatewayConversion(env, baseInput, {
      fetchImpl: (async () => new Response(null, { status: 204 })) as any,
    });
    expect(res).toMatchObject({ ok: true, status: 204, attempts: 1 });
  });

  it('does NOT retry 401/403/404 — those are our misconfig, not a blip', async () => {
    for (const status of [401, 403, 404]) {
      const fetchImpl = vi.fn(async () => new Response(null, { status }));
      const res = await sendGatewayConversion(env, baseInput, {
        fetchImpl: fetchImpl as any,
        sleepImpl: async () => {},
      });
      expect(res.ok).toBe(false);
      expect(res.retriable).toBe(false);
      expect(res.attempts).toBe(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('retries a 5xx and reports it as retriable when it never recovers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const res = await sendGatewayConversion(env, baseInput, {
      fetchImpl: fetchImpl as any,
      sleepImpl: async () => {},
      retryDelaysMs: [1, 1],
    });
    expect(res.ok).toBe(false);
    expect(res.retriable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('recovers on a retry', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      return n === 1 ? new Response(null, { status: 500 }) : new Response(null, { status: 204 });
    });
    const res = await sendGatewayConversion(env, baseInput, {
      fetchImpl: fetchImpl as any,
      sleepImpl: async () => {},
      retryDelaysMs: [1],
    });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('survives a thrown network error and reports it', async () => {
    const res = await sendGatewayConversion(env, baseInput, {
      fetchImpl: (async () => {
        throw new Error('ECONNRESET');
      }) as any,
      sleepImpl: async () => {},
      retryDelaysMs: [1],
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('ECONNRESET');
  });

  it('no-ops when the gateway is unconfigured (never throws into the lead path)', async () => {
    const res = await sendGatewayConversion({ SITE_URL: 'https://x.com' }, baseInput, {
      fetchImpl: (async () => {
        throw new Error('must not be called');
      }) as any,
    });
    expect(res).toMatchObject({ ok: false, error: 'gateway_not_configured', attempts: 0 });
  });
});

/**
 * Synthetic-lead smoke test. The load-bearing property is the NEGATIVE one: a real
 * lead must never pick up the test code, or its conversion silently lands in Meta's
 * Test stream instead of the live one and the revenue disappears from ROAS.
 */
describe('resolveTestEventCode', () => {
  const testEnv: GatewayEnv = {
    ...env,
    TRACKING_TEST_LEAD_EMAIL: 'gateway-smoke-test@soborbo.co.uk',
    TRACKING_TEST_EVENT_CODE: 'TEST12345',
  };

  it('tags ONLY the designated synthetic lead', () => {
    expect(resolveTestEventCode(testEnv, 'gateway-smoke-test@soborbo.co.uk')).toBe('TEST12345');
  });

  it('is case/whitespace-insensitive (the address is typed into a real form)', () => {
    expect(resolveTestEventCode(testEnv, '  Gateway-Smoke-Test@Soborbo.co.uk ')).toBe('TEST12345');
  });

  it('NEVER tags a real lead', () => {
    expect(resolveTestEventCode(testEnv, 'jane@customer.com')).toBeUndefined();
    expect(resolveTestEventCode(testEnv, undefined)).toBeUndefined();
  });

  it('is inert unless BOTH vars are set', () => {
    expect(
      resolveTestEventCode({ ...env, TRACKING_TEST_LEAD_EMAIL: 'x@y.z' }, 'x@y.z'),
    ).toBeUndefined();
    expect(
      resolveTestEventCode({ ...env, TRACKING_TEST_EVENT_CODE: 'TEST1' }, 'x@y.z'),
    ).toBeUndefined();
  });

  it('rides on the wire for the synthetic lead, and is absent for a real one', async () => {
    const captured: { url?: string; init?: any } = {};
    await sendGatewayConversion(
      testEnv,
      { ...baseInput, userData: { email: 'gateway-smoke-test@soborbo.co.uk' } },
      { fetchImpl: okFetch(captured) },
    );
    expect(JSON.parse(captured.init.body).test_event_code).toBe('TEST12345');

    const real: { url?: string; init?: any } = {};
    await sendGatewayConversion(
      testEnv,
      { ...baseInput, userData: { email: 'jane@customer.com' } },
      { fetchImpl: okFetch(real) },
    );
    expect(JSON.parse(real.init.body).test_event_code).toBeUndefined();
  });
});

/**
 * The service binding is not an optimisation — it is the only path that reaches the
 * gateway from on-zone. A plain fetch to our own zone's /api/event/* route is
 * short-circuited by Cloudflare's Worker-loop protection: the lead endpoint still
 * returns 200 and the gateway never sees the conversion. Silent zero.
 */
describe('service binding', () => {
  it('dispatches THROUGH the binding when one is bound, not via global fetch', async () => {
    const seen: { url?: string; init?: any } = {};
    const binding = {
      fetch: async (url: string, init: any) => {
        seen.url = url;
        seen.init = init;
        return new Response(null, { status: 204 });
      },
    };
    const globalFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const orig = globalThis.fetch;
    globalThis.fetch = globalFetch as any;
    try {
      const res = await sendGatewayConversion({ ...env, EVENT_GATEWAY: binding }, baseInput);
      expect(res.ok).toBe(true);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = orig;
    }

    // The Host must stay the SITE's hostname: the gateway resolves the tenant from
    // it (CLAUDE.md #14). Sending the gateway's own hostname would 404 the config.
    expect(seen.url).toBe('https://painlessremovals.com/api/event/conversion-server');
    expect(seen.init.headers['x-admin-token']).toBe('per-site-token');
  });
});
