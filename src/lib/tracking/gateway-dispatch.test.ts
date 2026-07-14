import { describe, it, expect, vi } from 'vitest';
import {
  buildGatewayPayload,
  sendGatewayConversion,
  isGatewayConfigured,
  gatewayBaseUrl,
  splitFullName,
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
  it('POSTs to /api/event/conversion with the per-site token header', async () => {
    const captured: { url?: string; init?: any } = {};
    const res = await sendGatewayConversion(env, baseInput, { fetchImpl: okFetch(captured) as any });

    expect(res.ok).toBe(true);
    expect(captured.url).toBe('https://painlessremovals.com/api/event/conversion');
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
