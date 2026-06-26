import { describe, it, expect } from 'vitest';
import {
  buildGatewayConversionPayload,
  isValidGatewayPayload,
  toGatewayEventName,
  GATEWAY_EVENT_NAMES,
} from './gateway';

/**
 * Contract net for the website → event-gateway payload. These prove the
 * website can never build something the gateway's isValidConversionPayload
 * would reject (event-name vocabulary, event_id charset, seconds-not-ms
 * event_time, value range, required turnstile_token).
 */

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = 'turnstile-token-xyz';

/** Every conversion event the website fires (CLAUDE.md conversion model). */
const WEBSITE_CONVERSIONS = [
  'contact_form_conversion',
  'clearance_callback_conversion',
  'phone_conversion',
  'email_conversion',
  'whatsapp_conversion',
  'quote_calculator_conversion',
  'callback_conversion',
];

describe('toGatewayEventName', () => {
  it('maps contact_form_conversion → contact_form_submit', () => {
    expect(toGatewayEventName('contact_form_conversion')).toBe('contact_form_submit');
  });

  it('maps clearance_callback_conversion → callback_conversion', () => {
    expect(toGatewayEventName('clearance_callback_conversion')).toBe('callback_conversion');
  });

  it('passes through names that already match the gateway vocabulary', () => {
    expect(toGatewayEventName('phone_conversion')).toBe('phone_conversion');
    expect(toGatewayEventName('quote_calculator_conversion')).toBe('quote_calculator_conversion');
  });

  it('passes through unknown names unchanged', () => {
    expect(toGatewayEventName('video_play')).toBe('video_play');
  });
});

describe('buildGatewayConversionPayload — core fields', () => {
  it('maps the event name to the gateway vocabulary', () => {
    const p = buildGatewayConversionPayload({ eventName: 'contact_form_conversion', turnstileToken: TOKEN });
    expect(p.event_name).toBe('contact_form_submit');
  });

  it('generates a v4 event_id when none is given', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', turnstileToken: TOKEN });
    expect(p.event_id).toMatch(V4);
  });

  it('keeps a valid caller-provided event_id (dedup key)', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', eventId: 'evt_abc-123', turnstileToken: TOKEN });
    expect(p.event_id).toBe('evt_abc-123');
  });

  it('regenerates the event_id when the provided one has illegal characters', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', eventId: 'has spaces!', turnstileToken: TOKEN });
    expect(p.event_id).not.toBe('has spaces!');
    expect(p.event_id).toMatch(V4);
  });

  it('regenerates the event_id when the provided one is too long (>60)', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', eventId: 'a'.repeat(61), turnstileToken: TOKEN });
    expect(p.event_id).toMatch(V4);
  });

  it('converts event time from milliseconds to seconds', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', eventTimeMs: 1_750_000_500_000, turnstileToken: TOKEN });
    expect(p.event_time).toBe(1_750_000_500);
  });

  it('defaults event_time to now in seconds', () => {
    const before = Math.floor(Date.now() / 1000);
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', turnstileToken: TOKEN });
    expect(p.event_time).toBeGreaterThanOrEqual(before);
    expect(p.event_time).toBeLessThanOrEqual(before + 2);
  });

  it('includes the turnstile token verbatim', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', turnstileToken: 'tok_123' });
    expect(p.turnstile_token).toBe('tok_123');
  });
});

describe('buildGatewayConversionPayload — value clamping', () => {
  it('keeps a normal value', () => {
    expect(buildGatewayConversionPayload({ eventName: 'quote_calculator_conversion', value: 1200, turnstileToken: TOKEN }).value).toBe(1200);
  });

  it('clamps a negative value to 0', () => {
    expect(buildGatewayConversionPayload({ eventName: 'quote_calculator_conversion', value: -5, turnstileToken: TOKEN }).value).toBe(0);
  });

  it('clamps an over-max value to 1e9', () => {
    expect(buildGatewayConversionPayload({ eventName: 'quote_calculator_conversion', value: 5e9, turnstileToken: TOKEN }).value).toBe(1_000_000_000);
  });

  it('omits value entirely when not a finite number', () => {
    const p = buildGatewayConversionPayload({ eventName: 'quote_calculator_conversion', value: NaN, turnstileToken: TOKEN });
    expect('value' in p).toBe(false);
  });

  it('omits value when not provided', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', turnstileToken: TOKEN });
    expect('value' in p).toBe(false);
  });
});

describe('buildGatewayConversionPayload — optional fields', () => {
  it('passes currency / service / source / event_source_url / client_id / fbp / fbc through', () => {
    const p = buildGatewayConversionPayload({
      eventName: 'quote_calculator_conversion',
      turnstileToken: TOKEN,
      currency: 'GBP', service: 'home', source: 'cta', eventSourceUrl: 'https://painlessremovals.com/',
      clientId: '123.456', fbp: 'fb.1.2.3', fbc: 'fb.1.2.click',
    });
    expect(p).toMatchObject({
      currency: 'GBP', service: 'home', source: 'cta', event_source_url: 'https://painlessremovals.com/',
      client_id: '123.456', fbp: 'fb.1.2.3', fbc: 'fb.1.2.click',
    });
  });

  it('passes RAW user_data through unhashed (gateway hashes server-side)', () => {
    const userData = { email: 'a@b.com', phone_number: '+447700900123', first_name: 'John' };
    const p = buildGatewayConversionPayload({ eventName: 'callback_conversion', turnstileToken: TOKEN, userData });
    expect(p.user_data).toEqual(userData);
  });

  it('omits user_data when the object is empty', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', turnstileToken: TOKEN, userData: {} });
    expect('user_data' in p).toBe(false);
  });

  it('omits optional fields that were not supplied', () => {
    const p = buildGatewayConversionPayload({ eventName: 'phone_conversion', turnstileToken: TOKEN });
    expect('currency' in p).toBe(false);
    expect('client_id' in p).toBe(false);
    expect('fbp' in p).toBe(false);
  });
});

describe('isValidGatewayPayload', () => {
  const good = () => buildGatewayConversionPayload({ eventName: 'quote_calculator_conversion', value: 1200, currency: 'GBP', turnstileToken: TOKEN });

  it('accepts a freshly built payload', () => {
    expect(isValidGatewayPayload(good())).toBe(true);
  });

  it('rejects an unknown event_name', () => {
    expect(isValidGatewayPayload({ ...good(), event_name: 'not_an_event' })).toBe(false);
  });

  it('rejects a missing turnstile_token', () => {
    const p: any = good();
    delete p.turnstile_token;
    expect(isValidGatewayPayload(p)).toBe(false);
  });

  it('rejects an event_id with illegal characters', () => {
    expect(isValidGatewayPayload({ ...good(), event_id: 'bad id!' })).toBe(false);
  });

  it('rejects an event_id longer than 60 chars', () => {
    expect(isValidGatewayPayload({ ...good(), event_id: 'a'.repeat(61) })).toBe(false);
  });

  it('rejects event_time given in milliseconds (must be seconds)', () => {
    expect(isValidGatewayPayload({ ...good(), event_time: Date.now() })).toBe(false);
  });

  it('rejects an event_time before the minimum epoch', () => {
    expect(isValidGatewayPayload({ ...good(), event_time: 1_000_000_000 })).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(isValidGatewayPayload({ ...good(), value: -1 })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isValidGatewayPayload(null)).toBe(false);
    expect(isValidGatewayPayload('x')).toBe(false);
  });
});

describe('contract: every website conversion builds a gateway-accepted payload', () => {
  it.each(WEBSITE_CONVERSIONS)('"%s" maps to an allowed name and passes validation', (name) => {
    const p = buildGatewayConversionPayload({
      eventName: name,
      value: 100,
      currency: 'GBP',
      service: 'home',
      turnstileToken: TOKEN,
      userData: { email: 'a@b.com' },
    });
    expect(GATEWAY_EVENT_NAMES.has(p.event_name)).toBe(true);
    expect(isValidGatewayPayload(p)).toBe(true);
  });
});
