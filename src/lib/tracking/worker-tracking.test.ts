// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isGatewayEnabled,
  getTurnstileToken,
  extractGAClientId,
  sendToGateway,
  trackConversion,
  __resetTurnstileCacheForTests,
} from './worker-tracking';
import { isValidGatewayPayload } from './gateway';

/**
 * Block-B net for the browser→gateway transport: Turnstile token caching,
 * cookie-derived signals, payload assembly (via gateway.ts) and the
 * shadow-flag gate (inert until PUBLIC_GATEWAY_ENABLED).
 */

let renderCount = 0;
let lastBeacon: string | undefined;

function installTurnstile(token = 'tok-123') {
  renderCount = 0;
  let cb: ((t: string) => void) | undefined;
  (window as any).turnstile = {
    render: (_c: unknown, opts: any) => {
      renderCount++;
      cb = opts.callback;
      return 'widget-1';
    },
    execute: () => { cb?.(token); },
    reset: () => {},
    getResponse: () => undefined,
  };
}

function lastFetchBody(): any {
  const call = (globalThis.fetch as any).mock.calls.at(-1);
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  __resetTurnstileCacheForTests();
  document.body.innerHTML = '<div id="cf-turnstile-invisible"></div>';
  // Clear cookies
  document.cookie.split(';').forEach((c) => {
    const k = c.split('=')[0].trim();
    if (k) document.cookie = `${k}=;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  (window as any).dataLayer = undefined;
  delete (window as any).turnstile;
  vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '0xSITEKEY');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Default: no sendBeacon → exercises the fetch path (easier to inspect).
  delete (navigator as any).sendBeacon;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isGatewayEnabled', () => {
  it('is false by default', () => {
    expect(isGatewayEnabled()).toBe(false);
  });
  it('is true only when the flag is exactly "true"', () => {
    vi.stubEnv('PUBLIC_GATEWAY_ENABLED', 'true');
    expect(isGatewayEnabled()).toBe(true);
    vi.stubEnv('PUBLIC_GATEWAY_ENABLED', '1');
    expect(isGatewayEnabled()).toBe(false);
  });
});

describe('extractGAClientId', () => {
  it('pulls the client id out of a _ga cookie', () => {
    expect(extractGAClientId('GA1.1.1234567890.1700000000')).toBe('1234567890.1700000000');
  });
  it('returns undefined for a malformed/absent cookie', () => {
    expect(extractGAClientId(undefined)).toBeUndefined();
    expect(extractGAClientId('GA1.1')).toBeUndefined();
  });
});

describe('getTurnstileToken', () => {
  it('returns undefined when Turnstile is not loaded', async () => {
    expect(await getTurnstileToken()).toBeUndefined();
  });

  it('returns undefined when the invisible container is missing', async () => {
    installTurnstile();
    document.body.innerHTML = '';
    expect(await getTurnstileToken()).toBeUndefined();
  });

  it('resolves the token from the widget callback', async () => {
    installTurnstile('tok-abc');
    expect(await getTurnstileToken()).toBe('tok-abc');
  });

  it('caches the token (no second render within the TTL)', async () => {
    installTurnstile('tok-abc');
    await getTurnstileToken();
    const second = await getTurnstileToken();
    expect(second).toBe('tok-abc');
    expect(renderCount).toBe(1);
  });
});

describe('sendToGateway — shadow gate', () => {
  it('is inert (no token, no network) when the flag is off', async () => {
    installTurnstile();
    const ok = await sendToGateway({ eventName: 'phone_conversion' });
    expect(ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('sendToGateway — enabled', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_GATEWAY_ENABLED', 'true');
  });

  it('returns false (no dispatch) when no Turnstile token is available', async () => {
    // turnstile not installed → no token
    const ok = await sendToGateway({ eventName: 'phone_conversion' });
    expect(ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('POSTs a gateway-valid payload with the token + cookie signals', async () => {
    installTurnstile('tok-xyz');
    document.cookie = '_fbp=fb.1.2.3';
    document.cookie = '_fbc=fb.1.2.click';
    document.cookie = '_ga=GA1.1.111.222';

    const ok = await sendToGateway({
      eventName: 'contact_form_conversion',
      value: 1200,
      currency: 'GBP',
      service: 'home',
      userData: { email: 'a@b.com', phone_number: '+447700900123' },
    });

    expect(ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = lastFetchBody();
    expect(isValidGatewayPayload(body)).toBe(true);
    expect(body.event_name).toBe('contact_form_submit'); // mapped
    expect(body.turnstile_token).toBe('tok-xyz');
    expect(body.fbp).toBe('fb.1.2.3');
    expect(body.fbc).toBe('fb.1.2.click');
    expect(body.client_id).toBe('111.222');
    expect(body.user_data).toEqual({ email: 'a@b.com', phone_number: '+447700900123' });
  });

  it('prefers sendBeacon when available (and does not also fetch)', async () => {
    installTurnstile('tok-xyz');
    const beacon = vi.fn(() => true);
    (navigator as any).sendBeacon = beacon;
    const ok = await sendToGateway({ eventName: 'phone_conversion' });
    expect(ok).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe('/api/event/conversion');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('preserves a shared event_id (dedup with the client pixel)', async () => {
    installTurnstile('tok-xyz');
    await sendToGateway({ eventName: 'callback_conversion', eventId: 'evt_shared01' });
    expect(lastFetchBody().event_id).toBe('evt_shared01');
  });
});

describe('trackConversion (cutover helper)', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_GATEWAY_ENABLED', 'true');
    installTurnstile('tok-xyz');
  });

  it('pushes a PII-free event to the dataLayer and returns the event_id', async () => {
    const id = await trackConversion('phone_conversion', {
      eventName: 'phone_conversion',
      value: 50,
      currency: 'GBP',
      userData: { email: 'secret@x.com' },
    });
    const dl = (window as any).dataLayer;
    const last = dl.at(-1);
    expect(last.event).toBe('phone_conversion');
    expect(last.event_id).toBe(id);
    expect(last.value).toBe(50);
    // PII must never reach the dataLayer
    expect(last.email).toBeUndefined();
    expect(last.user_data).toBeUndefined();
  });
});
