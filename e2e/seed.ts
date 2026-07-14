/**
 * E2E seed states — a COMPLETED calculator run, ready for the results page.
 *
 * These are plain-object `CalculatorState` literals (type-only import, no
 * runtime dependency on the store — calculator-store.ts pulls in
 * tracking/browser code we must not execute in the Playwright node
 * context). The shape mirrors `initialState` in
 * src/lib/calculator-store.ts with every field a completed run needs.
 *
 * Invariants (guarded by seed.test.ts against the REAL schema + pricing
 * engine, so the Playwright seed can never silently drift from the site):
 *
 *  - Survives `initializeStore()`'s zod restore:
 *    `LocalStorageStateSchema.partial().safeParse(seed)` must succeed.
 *  - Produces a computable quote: `quoteResult` (the exact computed store
 *    ResultPage renders from) returns totalPrice > 0. That requires
 *    `distances` to be present — `quoteResult` returns null without it.
 *  - Avoids every CallbackRequiredView gate (`requiresCallback` computed):
 *      * no `furnitureOnly.specialistItems`
 *      * propertySize !== '5bed-plus' (always survey)
 *      * modified cuft <= 2250 (thresholds.callbackRequired)
 *      * no complications reaching the survey point threshold
 *  - `contact` fully filled with gdprConsent:true — the results page
 *    auto-submits save-quote and the callback CTA posts this contact.
 *  - currentStep 12 = the results step; `sessionId` non-null so
 *    `initializeStore()` does NOT re-capture attribution over the seeded
 *    gclid/utm values.
 *  - `completionEventId`/`completionQuoteSignature` null = "not yet
 *    converted"; ResultPage mints + persists them at submit time.
 *
 * `mutatedSeed` differs in a QUOTE-AFFECTING input (propertySize 2bed →
 * 3bed-small: 750 vs 1000 base cuft, 4.0h vs 5.0h work time) so its
 * totalPrice differs — the changed-quote scenario relies on the quote
 * fingerprint changing.
 */

import type { CalculatorState } from '@/lib/calculator-store';

const SEEDED_AT = '2026-07-01T10:00:00.000Z';

export const baseSeed: CalculatorState = {
  // Meta
  currentStep: 12,
  highestStepReached: 12,
  startedAt: SEEDED_AT,
  lastUpdatedAt: SEEDED_AT,

  // Step 1: Service type — 'home' takes the full pricing path.
  serviceType: 'home',

  // Step 2: Property — '2bed' = 750 base cuft, well under the 2250-cuft
  // survey threshold; NOT '5bed-plus' (always requires callback).
  propertySize: '2bed',
  officeSize: null,
  furnitureOnly: null,

  // Step 3: Belongings slider — 3 = Average (multiplier 1.0).
  sliderPosition: 3,

  // Step 4: No manual crew override.
  useManualOverride: false,
  manualMen: null,
  manualVans: null,

  // Step 5: Flexible date, no selectedDate → no weekend/bank-holiday
  // surcharge, price is deterministic regardless of the run date.
  dateFlexibility: 'flexible',
  selectedDate: null,

  // Step 6: No complications → no survey-points gate.
  complications: [],

  // Step 7
  propertyChain: false,

  // Step 8: Addresses + distances. `distances` is REQUIRED — quoteResult
  // returns null without it. Small toToDepot keeps accommodation cost out.
  fromAddress: {
    formatted: '12 Harbourside Way, Bristol',
    postcode: 'BS1 5DB',
    lat: 51.4495,
    lng: -2.6037,
    floorLevel: 0,
  },
  toAddress: {
    formatted: '48 Gloucester Road, Bishopston, Bristol',
    postcode: 'BS7 8BH',
    lat: 51.4735,
    lng: -2.5906,
    floorLevel: 0,
  },
  distances: {
    depotToFrom: 6,
    fromToTo: 12,
    toToDepot: 9,
    driveTimeHours: 0.75,
    customerDistance: 12,
    customerDriveMinutes: 30,
  },

  // Step 9
  keyWaitWaiver: false,

  // Clearance flow unused for 'home'.
  clearance: {
    disposalItems: [],
    accessDifficulties: [],
  },

  // Step 10: No extras — keeps the base/mutated price difference purely
  // driven by property size.
  extras: {
    gateway: [],
    disassemblyItems: [],
    assembly: [],
  },

  // Step 11: Contact MUST be complete (gdprConsent true) — the results
  // page auto-submits save-quote with it and the callback CTA needs it.
  contact: {
    firstName: 'E2e',
    lastName: 'Tester',
    phone: '07700900123',
    email: 'e2e-tester@example.com',
    gdprConsent: true,
    marketingConsent: false,
  },

  // Tracking — gclid is overwritten per-variant by the adapter
  // (seedCompletedState injects variant.gclid). sessionId non-null stops
  // initializeStore() from re-capturing attribution over these values.
  gclid: null,
  utmSource: 'e2e',
  utmMedium: null,
  utmCampaign: null,
  landingPage: '/e2e/',
  sessionId: 'e2e-session',
  quoteId: null,
  completionEventId: null,
  completionQuoteSignature: null,
};

/** Same run with a QUOTE-AFFECTING input changed → different totalPrice. */
export const mutatedSeed: CalculatorState = {
  ...baseSeed,
  propertySize: '3bed-small',
};
