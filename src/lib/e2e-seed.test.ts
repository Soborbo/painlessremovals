// @vitest-environment jsdom
/**
 * Guards the Playwright e2e seeds (e2e/seed.ts) against drift from the
 * site schema and pricing engine.
 *
 * NOTE ON LOCATION: this file lives under src/lib/ (not e2e/) because
 * vitest.config.ts only includes `src/**` and `tests/**` — e2e/ is
 * Playwright territory. It imports the seeds from '../../e2e/seed'.
 *
 * Everything here runs the REAL production modules:
 *
 *  1. `LocalStorageStateSchema.partial().safeParse` — the exact parse
 *     `initializeStore()` applies to the sessionStorage blob the e2e
 *     adapter seeds. If this rejects, the results page silently discards
 *     the seed and every funnel scenario would fail confusingly.
 *  2. `quoteResult` / `requiresCallback` — the exact computed stores
 *     ResultPage renders from. Proves each seed produces a computable
 *     quote (totalPrice > 0) and does NOT trip CallbackRequiredView
 *     (specialist items / '5bed-plus' / >2250 cuft / complication survey
 *     — see the gates in calculator-store.ts).
 *  3. The two seeds price DIFFERENTLY (the changed-quote scenario needs a
 *     new quote fingerprint → new conversion event_id).
 *
 * jsdom env: importing calculator-store pulls in browser-flavoured
 * tracking modules (they're guarded, but jsdom keeps this faithful).
 */

import { describe, expect, it } from 'vitest';
import {
  LocalStorageStateSchema,
  calculatorStore,
  initialState,
  quoteResult,
  requiresCallback,
  type CalculatorState,
} from '@/lib/calculator-store';
import { baseSeed, mutatedSeed } from '../../e2e/seed';

function priceFor(seed: CalculatorState): number {
  calculatorStore.set({ ...initialState, ...seed });
  const gate = requiresCallback.get();
  expect(
    gate.required,
    `seed must not trigger CallbackRequiredView (reason: ${'reason' in gate ? gate.reason : 'n/a'})`,
  ).toBe(false);

  const quote = quoteResult.get();
  expect(quote, 'quoteResult must be computable (distances present, no callback gate)').not.toBeNull();
  expect(quote!.requiresCallback).toBe(false);
  expect(quote!.totalPrice).toBeGreaterThan(0);
  return quote!.totalPrice;
}

describe('e2e seeds vs the real calculator schema + pricing engine', () => {
  it('baseSeed survives the initializeStore() zod restore path', () => {
    const restored = LocalStorageStateSchema.partial().safeParse(baseSeed);
    expect(restored.success, JSON.stringify(!restored.success && restored.error.issues)).toBe(true);
    // The full (non-partial) schema must pass too — the seed provides
    // every key, so nothing may rely on .partial() leniency.
    expect(LocalStorageStateSchema.safeParse(baseSeed).success).toBe(true);
    // The parse must not strip the fields the results page depends on.
    const data = restored.success ? restored.data : {};
    expect(data).toMatchObject({
      currentStep: 12,
      serviceType: 'home',
      propertySize: '2bed',
      sessionId: 'e2e-session',
      completionEventId: null,
      completionQuoteSignature: null,
    });
  });

  it('mutatedSeed survives the initializeStore() zod restore path', () => {
    const restored = LocalStorageStateSchema.partial().safeParse(mutatedSeed);
    expect(restored.success, JSON.stringify(!restored.success && restored.error.issues)).toBe(true);
    expect(LocalStorageStateSchema.safeParse(mutatedSeed).success).toBe(true);
  });

  it('contact is complete — save-quote auto-submit and the callback CTA need it', () => {
    for (const seed of [baseSeed, mutatedSeed]) {
      expect(seed.contact.firstName).toBeTruthy();
      expect(seed.contact.lastName).toBeTruthy();
      expect(seed.contact.phone).toBeTruthy();
      expect(seed.contact.email).toContain('@');
      expect(seed.contact.gdprConsent).toBe(true);
    }
  });

  it('both seeds price via the real quoteResult path, with DIFFERENT totals', () => {
    const basePrice = priceFor(baseSeed);
    const mutatedPrice = priceFor(mutatedSeed);
    expect(
      mutatedPrice,
      'mutatedSeed must change a quote-affecting input — equal totals would break the changed-quote scenario',
    ).not.toBe(basePrice);
  });

  it('seeds steer clear of every CallbackRequiredView trigger by construction', () => {
    for (const seed of [baseSeed, mutatedSeed]) {
      expect(seed.furnitureOnly).toBeNull();
      expect(seed.propertySize).not.toBe('5bed-plus');
      expect(seed.complications ?? []).toHaveLength(0);
    }
  });
});
