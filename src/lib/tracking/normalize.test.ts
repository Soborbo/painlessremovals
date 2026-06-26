import { describe, it, expect } from 'vitest';
import { normalizePhoneE164, normalizeUserData } from './tracking';

/**
 * Regression net for the normalization invariants (CLAUDE.md rule #7).
 *
 * These feed the SHA-256 hashes that Meta + Google Ads match on, so any
 * drift here silently collapses match quality. Lock the exact output.
 */

describe('normalizePhoneE164 — GB (default)', () => {
  it('returns empty string for empty input', () => {
    expect(normalizePhoneE164('')).toBe('');
  });

  it('converts a leading-0 national number to +44', () => {
    expect(normalizePhoneE164('07700900123')).toBe('+447700900123');
  });

  it('strips spaces', () => {
    expect(normalizePhoneE164('07700 900 123')).toBe('+447700900123');
  });

  it('strips dashes', () => {
    expect(normalizePhoneE164('07700-900-123')).toBe('+447700900123');
  });

  it('strips parentheses', () => {
    expect(normalizePhoneE164('(0117) 9123456')).toBe('+441179123456');
  });

  it('passes through an already-+E.164 number', () => {
    expect(normalizePhoneE164('+447700900123')).toBe('+447700900123');
  });

  it('cleans whitespace inside an already-+ number', () => {
    expect(normalizePhoneE164('+44 7700 900123')).toBe('+447700900123');
  });

  it('prefixes a 44-prefixed number with +', () => {
    expect(normalizePhoneE164('447700900123')).toBe('+447700900123');
  });

  it('prefixes a bare national number (no leading 0) with +44', () => {
    expect(normalizePhoneE164('7700900123')).toBe('+447700900123');
  });

  it('defaults to GB when no country code is given', () => {
    expect(normalizePhoneE164('07700900123', undefined)).toBe('+447700900123');
  });
});

describe('normalizePhoneE164 — HU', () => {
  it('converts 06 mobile prefix to +36', () => {
    expect(normalizePhoneE164('06201234567', 'HU')).toBe('+36201234567');
  });

  it('strips separators then converts 06', () => {
    expect(normalizePhoneE164('06 20 123 4567', 'HU')).toBe('+36201234567');
  });

  it('converts a single leading 0 to +36', () => {
    expect(normalizePhoneE164('0201234567', 'HU')).toBe('+36201234567');
  });

  it('prefixes a 36-prefixed number with +', () => {
    expect(normalizePhoneE164('36201234567', 'HU')).toBe('+36201234567');
  });

  it('prefixes a bare national number with +36', () => {
    expect(normalizePhoneE164('201234567', 'HU')).toBe('+36201234567');
  });

  it('passes through an already-+36 number', () => {
    expect(normalizePhoneE164('+36201234567', 'HU')).toBe('+36201234567');
  });

  it('honours an explicit + even when country is HU (+ always wins)', () => {
    expect(normalizePhoneE164('+447700900123', 'HU')).toBe('+447700900123');
  });
});

describe('normalizeUserData', () => {
  it('always stamps the country code (default GB) even for empty input', () => {
    expect(normalizeUserData({})).toEqual({ country: 'GB' });
  });

  it('lowercases and trims email', () => {
    expect(normalizeUserData({ email: '  John@Example.COM ' }).email).toBe('john@example.com');
  });

  it('normalizes phone via E.164', () => {
    expect(normalizeUserData({ phone_number: '07700 900123' }).phone_number).toBe('+447700900123');
  });

  it('lowercases and trims first and last name', () => {
    const out = normalizeUserData({ first_name: '  JOHN ', last_name: ' Smith ' });
    expect(out.first_name).toBe('john');
    expect(out.last_name).toBe('smith');
  });

  it('lowercases and trims city and street', () => {
    const out = normalizeUserData({ city: '  Bristol ', street: ' 12 High St ' });
    expect(out.city).toBe('bristol');
    expect(out.street).toBe('12 high st');
  });

  it('uppercases postal code and removes all spaces', () => {
    expect(normalizeUserData({ postal_code: 'bs1 2ab' }).postal_code).toBe('BS12AB');
  });

  it('uses the given country code and normalizes phone for it', () => {
    const out = normalizeUserData({ phone_number: '06201234567' }, 'HU');
    expect(out.country).toBe('HU');
    expect(out.phone_number).toBe('+36201234567');
  });

  it('output country reflects the param, ignoring any input.country-shaped field', () => {
    // normalizeUserData stamps country from the param, not the input blob.
    const out = normalizeUserData({ email: 'a@b.com' } as never, 'HU');
    expect(out.country).toBe('HU');
  });

  it('omits fields that are empty strings (falsy guard)', () => {
    const out = normalizeUserData({ email: '', first_name: '' });
    expect(out.email).toBeUndefined();
    expect(out.first_name).toBeUndefined();
  });

  it('only includes fields that were provided', () => {
    const out = normalizeUserData({ email: 'a@b.com' });
    expect(out).toEqual({ country: 'GB', email: 'a@b.com' });
  });
});
