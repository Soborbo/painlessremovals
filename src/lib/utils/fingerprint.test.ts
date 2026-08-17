/**
 * Fingerprint dedup invariants.
 *
 * The bug these guard against shipped and stayed live for weeks: every dedup
 * in the funnel hashed the raw submission data, which carries a `completedAt`
 * minted fresh by `getSubmissionData()` on every call. The hash therefore
 * rotated per call and NO dedup could ever match — a results-page refresh
 * re-fired `quote_calculator_conversion` under a new event_id (double-counting
 * in Ads/GA4/Meta), save-quote's KV idempotency whiffed on double-clicks, and
 * a callback retry created a second CRM lead.
 *
 * It is invisible in production (conversions just quietly inflate), so the
 * invariant is pinned here instead.
 */

import { describe, it, expect } from 'vitest';
import { generateFingerprint, quoteFingerprint, stripVolatile, VOLATILE_FINGERPRINT_KEYS } from './fingerprint';

/** Shaped like `getSubmissionData()` output, trimmed to what matters here. */
function submission(overrides: Record<string, unknown> = {}) {
  return {
    serviceType: 'removal',
    propertySize: '3-bed',
    fromAddress: { postcode: 'BS10 5EN' },
    toAddress: { postcode: 'BS1 4DJ' },
    selectedDate: '2026-09-01',
    extras: { packingTier: 'full' },
    contact: { email: 'a@b.com', phone: '07700900123' },
    startedAt: '2026-08-17T09:00:00.000Z',
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('quoteFingerprint', () => {
  it('is stable across calls that differ only in completedAt', () => {
    // Two getSubmissionData() calls for the SAME quote, one second apart.
    const first = submission({ completedAt: '2026-08-17T09:05:00.000Z' });
    const second = submission({ completedAt: '2026-08-17T09:05:01.000Z' });

    expect(quoteFingerprint({ data: first, totalPrice: 850 })).toBe(
      quoteFingerprint({ data: second, totalPrice: 850 }),
    );
  });

  it('still changes when a quote-affecting input changes', () => {
    // The signature must NOT become a constant: going back, changing the move
    // and returning has to mint a fresh event_id, or the new quote's
    // conversion is suppressed by the previous quote's fired-guard.
    const base = submission();
    const movedHouse = submission({ toAddress: { postcode: 'BA1 1AA' } });

    expect(quoteFingerprint({ data: base, totalPrice: 850 })).not.toBe(
      quoteFingerprint({ data: movedHouse, totalPrice: 850 }),
    );
  });

  it('still changes when the price changes', () => {
    const data = submission();
    expect(quoteFingerprint({ data, totalPrice: 850 })).not.toBe(
      quoteFingerprint({ data, totalPrice: 900 }),
    );
  });

  it('is order-independent, like the raw hash', () => {
    const a = { serviceType: 'removal', propertySize: '3-bed', completedAt: 'x' };
    const b = { propertySize: '3-bed', completedAt: 'y', serviceType: 'removal' };
    expect(quoteFingerprint({ data: a, totalPrice: 1 })).toBe(quoteFingerprint({ data: b, totalPrice: 1 }));
  });

  it('client and server hash the identical shape', () => {
    // ResultPage/Step12Quote compute `completionQuoteSignature` and save-quote
    // computes its dedup key from the same payload; if these ever diverge the
    // client's guard and the server's idempotency stop agreeing.
    const data = submission();
    const clientSide = quoteFingerprint({ data, totalPrice: 850 });
    const serverSide = quoteFingerprint({ data: JSON.parse(JSON.stringify(data)), totalPrice: 850 });
    expect(clientSide).toBe(serverSide);
  });
});

describe('stripVolatile', () => {
  it('removes every volatile key and nothing else', () => {
    const stripped = stripVolatile(submission()) as Record<string, unknown>;
    for (const key of VOLATILE_FINGERPRINT_KEYS) {
      expect(stripped).not.toHaveProperty(key);
    }
    expect(stripped.serviceType).toBe('removal');
    expect(stripped.startedAt).toBe('2026-08-17T09:00:00.000Z');
  });

  it('does not mutate the caller\'s object', () => {
    // The same object is POSTed to the API — stripping must not silently drop
    // completedAt from the payload the CRM/DB actually stores.
    const data = submission();
    stripVolatile(data);
    expect(data).toHaveProperty('completedAt');
  });

  it('passes non-objects through untouched', () => {
    expect(stripVolatile(null)).toBeNull();
    expect(stripVolatile('str')).toBe('str');
    expect(stripVolatile([1, 2])).toEqual([1, 2]);
  });

  it('leaves the raw generateFingerprint behaviour alone', () => {
    // generateFingerprint is still the unfiltered primitive — other callers
    // (rate-limit keys, callbacks' composite hash) rely on that.
    const withTs = submission({ completedAt: 'a' });
    const otherTs = submission({ completedAt: 'b' });
    expect(generateFingerprint(withTs)).not.toBe(generateFingerprint(otherTs));
  });
});
