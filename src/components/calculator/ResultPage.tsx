/**
 * CALCULATION RESULT PAGE
 *
 * Wireframe v6 layout — 2-column grid:
 * - LEFT col: Price card (row 1), Decision/CTA card (row 2)
 * - RIGHT col: Video card (row 1), Breakdown card (row 2)
 * - Full-width: Alt quote (optional), Meta bar
 *
 * Mobile: single column in DOM order (price → decision → video → breakdown)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { QuoteLoadingScreen } from './QuoteLoadingScreen';
import {
  calculatorStore,
  quoteResult,
  requiresCallback,
  finalResources,
  getSubmissionData,
  clearState,
  initializeStore,
  initialState,
  type CalculatorState,
} from '@/lib/calculator-store';
import { encodeQuoteState } from '@/lib/quote-url';
import { calculateQuote, type QuoteResult } from '@/lib/calculator-logic';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { getPackingSizeCategory } from '@/lib/constants';
import { CONFIG } from '@/lib/config';
import { toast, ToastContainer } from '@/components/ui/toast';
import { REVIEW_STATS } from '@/lib/review-config';
import { trackError } from '@/lib/errors/tracker';
import {
  trackEvent,
  setUserDataOnDOM,
  normalizeUserData,
  mirrorMetaCapi,
  resetQuoteState,
  markViewContentFired,
  hasViewContentFired,
  markQuoteUpgraded,
  getActiveQuoteState,
  generateUUID,
} from '@/lib/tracking';

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';
type CallbackStatus = 'idle' | 'submitting' | 'success' | 'error';

// ===================
// HELPER: Get individual extras breakdown with prices
// ===================

interface ExtraLineItem {
  label: string;
  detail?: string;
  price: number;
}

function getExtrasBreakdown(state: ReturnType<typeof calculatorStore.get>, cubes: number): ExtraLineItem[] {
  const items: ExtraLineItem[] = [];
  const extras = state.extras;

  // Packing
  if (extras.packingTier) {
    const tierConfig = CALCULATOR_CONFIG.packingTiers[extras.packingTier as keyof typeof CALCULATOR_CONFIG.packingTiers];
    if (tierConfig && tierConfig.priceBySize) {
      const sizeCategory = getPackingSizeCategory(cubes);
      const price = tierConfig.priceBySize[sizeCategory as keyof typeof tierConfig.priceBySize];
      items.push({ label: `Packing — ${tierConfig.label}`, price });
    }
  } else if (extras.packing) {
    const packConfig = CALCULATOR_CONFIG.packing[extras.packing];
    items.push({ label: `Packing — ${packConfig.label}`, price: packConfig.total });
  }

  // Cleaning
  if (extras.cleaningRooms && extras.cleaningRooms > 0) {
    const roomKey = Math.max(1, Math.min(extras.cleaningRooms, 6)) as 1 | 2 | 3 | 4 | 5 | 6;
    const basePrice = CALCULATOR_CONFIG.cleaning[roomKey]?.price ?? 90;
    const cleaningType = (extras.cleaningType || 'quick') as keyof typeof CALCULATOR_CONFIG.cleaningTiers;
    const multiplier = CALCULATOR_CONFIG.cleaningTiers[cleaningType]?.multiplier || 1.0;
    const tierLabel = CALCULATOR_CONFIG.cleaningTiers[cleaningType]?.label || 'Quick Clean';
    items.push({
      label: `End of tenancy cleaning — ${extras.cleaningRooms} rooms (${tierLabel})`,
      price: Math.round(basePrice * multiplier),
    });
  }

  // Storage
  if (extras.storageSize && extras.storageWeeks) {
    const sizeConfig = CALCULATOR_CONFIG.storageSizes[extras.storageSize as keyof typeof CALCULATOR_CONFIG.storageSizes];
    if (sizeConfig) {
      const weeks = extras.storageWeeks;
      const discountedWeeks = Math.min(weeks, 8);
      const fullPriceWeeks = Math.max(0, weeks - 8);
      const total = (discountedWeeks * sizeConfig.price * 0.5) + (fullPriceWeeks * sizeConfig.price);
      items.push({
        label: `Storage — ${sizeConfig.label} (${weeks} weeks)`,
        price: Math.round(total),
      });
    }
  } else if (extras.storage) {
    const storageConfig = CALCULATOR_CONFIG.storage[extras.storage];
    items.push({ label: `Storage — ${storageConfig.label}`, price: storageConfig.price });
  }

  // Disassembly items — merged into one line
  const assemblyItems = extras.disassemblyItems?.length
    ? extras.disassemblyItems
    : extras.assembly?.length
    ? extras.assembly.map(a => ({ category: a.type, quantity: a.quantity }))
    : [];
  if (assemblyItems.length > 0) {
    let totalPrice = 0;
    const parts: string[] = [];
    for (const item of assemblyItems) {
      const config = CALCULATOR_CONFIG.assembly[item.category];
      totalPrice += config.price * item.quantity;
      parts.push(`${item.quantity} × ${config.label.toLowerCase()}`);
    }
    items.push({
      label: 'Furniture assembly/disassembly',
      detail: parts.join(', '),
      price: totalPrice,
    });
  }

  return items;
}

// ===================
// HELPER: Calculate alternative day-count quote
// ===================

function calculateAlternativeQuote(
  state: ReturnType<typeof calculatorStore.get>,
  currentQuote: QuoteResult
): QuoteResult | null {
  if (!state.distances || !state.serviceType) return null;
  if (currentQuote.isHalfDay) return null;

  const t = currentQuote.totalJobTime;
  const currentDays = currentQuote.serviceDays;
  let forceBilling: 'singleDay' | 'splitDay' | 'threeDay';

  if (currentDays === 1) {
    if (t > 10) forceBilling = 'splitDay';
    else return null;
  } else if (currentDays === 2) {
    forceBilling = 'singleDay';
  } else if (currentDays === 3) {
    forceBilling = 'splitDay';
  } else {
    return null;
  }

  try {
    const input: Record<string, unknown> = {
      serviceType: state.serviceType,
      sliderPosition: state.sliderPosition,
      complications: state.complications || [],
      propertyChain: state.propertyChain || false,
      distances: state.distances,
      extras: state.extras,
      keyWaitWaiver: state.keyWaitWaiver || false,
      forceBilling,
    };
    if (state.propertySize) input.propertySize = state.propertySize;
    if (state.officeSize) input.officeSize = state.officeSize;
    if (state.selectedDate) input.selectedDate = state.selectedDate;
    if (state.furnitureOnly) {
      input.furnitureOnly = {
        itemCount: state.furnitureOnly.itemCount,
        needs2Person: state.furnitureOnly.needs2Person,
        over40kg: state.furnitureOnly.over40kg,
        hasSpecialist: state.furnitureOnly.specialistItems.length > 0,
      };
    }

    const alt = calculateQuote(input as unknown as Parameters<typeof calculateQuote>[0]);
    if (alt && alt.serviceDays !== currentDays) return alt;
    return null;
  } catch {
    return null;
  }
}

// ===================
// HELPER: Build cost breakdown with margin baked in
// ===================

interface CostLineItem {
  label: string;
  detail?: string;
  amount: number;
}

function buildCostBreakdown(quote: QuoteResult, state: ReturnType<typeof calculatorStore.get>): CostLineItem[] {
  const lines: CostLineItem[] = [];
  const b = quote.breakdown;
  const marginRatio = b.controllableCost > 0 ? b.marginedTotal / b.controllableCost : 1;

  const crewWithMargin = Math.round(b.crewCost * marginRatio);
  const vansWithMargin = Math.round(b.vansCost * marginRatio);
  lines.push({
    label: 'Crew & vehicle',
    detail: `${quote.men}-person team, ${quote.vans} van${quote.vans > 1 ? 's' : ''} · ${quote.serviceDays} day${quote.serviceDays > 1 ? 's' : ''}`,
    amount: crewWithMargin + vansWithMargin,
  });

  if (b.surchargeCost > 0 && quote.surcharge) {
    const surchargeWithMargin = Math.round(b.surchargeCost * marginRatio);
    lines.push({
      label: `${quote.surcharge.type === 'saturday' ? 'Saturday' : 'Bank holiday'} surcharge`,
      amount: surchargeWithMargin,
    });
  }

  if (b.mileageCost > 0) {
    const totalMiles = state.distances
      ? Math.round(state.distances.depotToFrom + state.distances.fromToTo + state.distances.toToDepot)
      : 0;
    lines.push({
      label: 'Mileage',
      detail: `${totalMiles} miles round trip from our Bristol depot`,
      amount: Math.round(b.mileageCost),
    });
  }

  if (b.accommodationCost > 0) {
    lines.push({ label: 'Crew accommodation (overnight)', amount: Math.round(b.accommodationCost) });
  }

  const extrasItems = getExtrasBreakdown(state, quote.cubes);
  for (const item of extrasItems) {
    if (item.detail) {
      lines.push({ label: item.label, detail: item.detail, amount: item.price });
    } else {
      // Split label into main + detail at the dash
      const dashIdx = item.label.indexOf(' — ');
      if (dashIdx > 0) {
        lines.push({
          label: item.label.slice(0, dashIdx),
          detail: item.label.slice(dashIdx + 3),
          amount: item.price,
        });
      } else {
        lines.push({ label: item.label, amount: item.price });
      }
    }
  }

  if (b.keyWaitWaiverCost > 0) {
    lines.push({
      label: 'Key Wait Waiver',
      detail: 'No overtime charges if keys are delayed',
      amount: Math.round(b.keyWaitWaiverCost),
    });
  }

  return lines;
}

function buildClearanceCostBreakdown(quote: QuoteResult, state: ReturnType<typeof calculatorStore.get>): CostLineItem[] {
  const lines: CostLineItem[] = [];

  const disposalItems = state.clearance?.disposalItems?.filter(i => i.quantity > 0) || [];
  let disposalCost = 0;
  for (const item of disposalItems) {
    const config = CALCULATOR_CONFIG.houseClearance.disposal[item.type as keyof typeof CALCULATOR_CONFIG.houseClearance.disposal];
    const amount = config.price * item.quantity;
    disposalCost += amount;
    lines.push({ label: `${config.label} x ${item.quantity}`, amount });
  }

  const mileageCost = Math.round(quote.breakdown.mileageCost);
  // Access difficulty surcharge is merged into Labour & Van (not shown separately)
  const labourAndVan = Math.round(quote.totalPrice - disposalCost - mileageCost);
  if (labourAndVan > 0) {
    lines.push({ label: 'Labour & Van', amount: labourAndVan });
  }

  if (mileageCost > 0) {
    const totalMiles = state.distances
      ? Math.round(state.distances.depotToFrom + state.distances.fromToTo + state.distances.toToDepot)
      : 0;
    lines.push({ label: 'Mileage', detail: `${totalMiles} miles round trip`, amount: mileageCost });
  }

  return lines;
}

// ===================
// INLINE STYLES (matching wireframe v6)
// ===================

const V = {
  terracotta: '#C45D3E',
  terracottaHover: '#A84D33',
  teal: '#2A7F7F',
  tealDark: '#1B5E5E',
  tealLight: '#E8F4F4',
  goldStar: '#E8B84B',
  dark: '#1E1E1E',
  warmWhite: '#FAF7F2',
  warmGray: '#F0EBE3',
  midGray: '#8A8578',
  lightBorder: '#E5DFD5',
  serif: "'Fraunces', Georgia, serif",
  sans: "'DM Sans', -apple-system, sans-serif",
  radius: '12px',
  radiusSm: '8px',
  cardShadow: '0 1px 3px rgba(30,30,30,0.04), 0 8px 32px rgba(30,30,30,0.07)',
  cardShadowLight: '0 1px 3px rgba(30,30,30,0.04), 0 4px 16px rgba(30,30,30,0.04)',
} as const;

// ===================
// MAIN COMPONENT
// ===================

export function ResultPage() {
  const state = useStore(calculatorStore);
  const quote = useStore(quoteResult);
  const callbackRequired = useStore(requiresCallback);
  useStore(finalResources);

  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callbackStatus, setCallbackStatus] = useState<CallbackStatus>('idle');
  const hasSubmittedRef = useRef(false);
  const [storeReady, setStoreReady] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);

  // Initialize store
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('q');

    if (token) {
      // `?q=` payloads are HMAC-signed by the server. Verify before
      // hydrating the calculator — a forged token must not be able to
      // pre-populate state with attacker-chosen pricing or trigger any
      // submit/conversion flow.
      let cancelled = false;
      hasSubmittedRef.current = true; // never auto-submit shared quotes
      void (async () => {
        try {
          const res = await fetch('/api/quote-url/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(`verify status ${res.status}`);
          const body = await res.json() as { valid?: boolean; state?: Partial<CalculatorState> };
          if (cancelled) return;
          if (body.valid && body.state) {
            calculatorStore.set({ ...initialState, ...body.state });
          } else {
            // Forged or stale token — drop the param and fall back to
            // the user's own session state.
            initializeStore();
          }
        } catch {
          if (!cancelled) initializeStore();
        } finally {
          if (!cancelled) setStoreReady(true);
        }
      })();
      return () => { cancelled = true; };
    }

    initializeStore();
    // Submission dedup is enforced server-side by a fingerprint over
    // the validated payload (see save-quote.ts in-flight sentinel),
    // so no client-side flag is needed.
    setShowLoadingScreen(true);
    setStoreReady(true);
  }, []);

  // Submit quote to backend
  const submitQuote = useCallback(async () => {
    if (submissionStatus === 'submitting' || submissionStatus === 'success') return;
    if (!quote) return;

    setSubmissionStatus('submitting');
    setErrorMessage(null);

    // Generated up-front so both the initial attempt and the retry
    // share one dedup key with the matching client-side conversion.
    const eventId = generateUUID();

    try {
      const submissionData = getSubmissionData();
      // Encoded quote payload (no signature). The server signs it with
      // its own HMAC secret and assembles the public-facing share URL
      // — we never sign anything client-side.
      const quoteUrlPayload = encodeQuoteState(state);

      // Read attribution from localStorage (set during loading screen)
      let attribution: string | undefined;
      try {
        const stored = JSON.parse(localStorage.getItem('painless_quote') || '{}') as Record<string, unknown>;
        if (typeof stored.attribution === 'string') {
          attribution = stored.attribution;
        }
      } catch {
        // localStorage unavailable
      }

      // Include attribution in submission data so it reaches the backend
      const dataWithAttribution = attribution
        ? { ...submissionData, attribution }
        : submissionData;

      // (eventId was generated above the try block so the retry path
      // can reuse it.)

      const apiData = {
        data: dataWithAttribution,
        totalPrice: quote.totalPrice,
        breakdown: quote.breakdown,
        currency: 'GBP' as const,
        name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
        email: state.contact?.email,
        phone: state.contact?.phone,
        language: 'en' as const,
        utm_source: state.utmSource || undefined,
        utm_medium: state.utmMedium || undefined,
        utm_campaign: state.utmCampaign || undefined,
        gclid: state.gclid || undefined,
        quoteUrlPayload,
        event_id: eventId,
      };

      const response = await fetch('/api/save-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error('Failed to submit quote');

      const result = await response.json() as { quoteId?: string };

      // Persist the server-issued quote ID so the displayed ref matches
      // what the team sees in their inbox / DB.
      if (result.quoteId) {
        calculatorStore.setKey('quoteId', result.quoteId);
      }

      // PII to DOM side-channel (never dataLayer).
      if (state.contact) {
        setUserDataOnDOM(
          normalizeUserData({
            email: state.contact.email,
            phone_number: state.contact.phone,
            first_name: state.contact.firstName,
            last_name: state.contact.lastName,
          }),
        );
      }

      // Start the 60-min upgrade window. The actual conversion fires
      // either when the user upgrades (phone/email/whatsapp/callback)
      // or when the timer elapses without an upgrade. Reuse the same
      // event_id as save-quote so client + server hits share a dedup
      // key.
      const quoteState = resetQuoteState({
        value: quote.totalPrice,
        service: state.serviceType || 'removal',
        eventId,
      });

      // Engagement event — fires on every completion.
      trackEvent('quote_calculator_complete', {
        event_id: quoteState.eventId,
        quote_id: result.quoteId,
        quote_value: quote.totalPrice,
        value: quote.totalPrice,
        currency: 'GBP',
        service: state.serviceType || 'removal',
      });

      // Meta ViewContent — first completion only, no value.
      // Reads the dedicated VIEW_CONTENT_FIRED_KEY localStorage flag,
      // which survives quote-state deletion across re-runs.
      if (!hasViewContentFired()) {
        trackEvent('quote_calculator_first_view', {
          event_id: quoteState.eventId,
          service: state.serviceType || 'removal',
        });
        void mirrorMetaCapi('quote_calculator_first_view', quoteState.eventId, {});
        markViewContentFired();
      }

      setSubmissionStatus('success');
    } catch (error) {
      trackError('MOVE-QUOTE-001', error, { phase: 'submit-quote' }, 'ResultPage');
      setSubmissionStatus('error');
      setErrorMessage(
        "There was a problem saving your quote. Don't worry — your quote is still valid! Please call us to confirm."
      );

      setTimeout(async () => {
        try {
          const submissionData = getSubmissionData();
          // Reuse the same event_id from the original attempt so the
          // server-side GA4 MP mirror dedupes against the browser's
          // (eventually-fired) conversion event. Without this the
          // retry produced a fresh id and broke BigQuery joins.
          const apiData = {
            data: submissionData,
            totalPrice: quote.totalPrice,
            breakdown: quote.breakdown,
            currency: 'GBP' as const,
            name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
            email: state.contact?.email,
            phone: state.contact?.phone,
            language: 'en' as const,
            event_id: eventId,
          };

          const retryResponse = await fetch('/api/save-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData),
          });

          if (retryResponse.ok) {
            setSubmissionStatus('success');
            setErrorMessage(null);
          }
        } catch {
          // Silent retry failure
        }
      }, 3000);
    }
  }, [submissionStatus, quote, state.contact, state.utmSource, state.utmMedium, state.utmCampaign, state.gclid, state.serviceType]);

  // Auto-submit on mount (skip if loading screen is showing — we wait for attribution)
  useEffect(() => {
    if (!hasSubmittedRef.current && quote && storeReady && !showLoadingScreen) {
      hasSubmittedRef.current = true;
      submitQuote();
    }
  }, [submitQuote, quote, storeReady, showLoadingScreen]);

  // Show toast when email confirmation is sent
  useEffect(() => {
    if (submissionStatus === 'success' && state.contact?.email) {
      toast.success(
        `We've sent a copy of this quote to ${state.contact.email}. Use the link in that email to access your quote anytime.`,
        8000
      );
    }
  }, [submissionStatus, state.contact?.email]);

  // Handle callback request
  const handleRequestCallback = useCallback(async () => {
    if (callbackStatus === 'submitting' || callbackStatus === 'success') return;
    setCallbackStatus('submitting');

    try {
      const submissionData = getSubmissionData();
      const response = await fetch('/api/callbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          contact: state.contact,
          name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
          email: state.contact?.email,
          phone: state.contact?.phone,
          callbackReason: 'Customer requested callback from quote page',
          data: submissionData,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit callback request');
      setCallbackStatus('success');

      // Push contact PII to DOM side-channel for GTM UPD variable.
      if (state.contact) {
        setUserDataOnDOM(
          normalizeUserData({
            email: state.contact.email,
            phone_number: state.contact.phone,
            first_name: state.contact.firstName,
            last_name: state.contact.lastName,
          }),
        );
      }

      // The callback consumes the active quote (if any) as its upgrade.
      // Source is "after_calculator" only if the upgrade window is still
      // open — past that, the calculator-store `quote` is still truthy
      // but the conversion has either fired late or expired, so this is
      // a standalone callback.
      const active = getActiveQuoteState();
      const eventId = active ? active.eventId : generateUUID();
      const quoteVal = active ? active.value : 0;
      const service = active ? active.service : state.serviceType || 'removal';
      if (active) markQuoteUpgraded();

      trackEvent('callback_conversion', {
        event_id: eventId,
        value: quoteVal,
        currency: 'GBP',
        service,
        source: active ? 'after_calculator' : 'standalone',
      });
      void mirrorMetaCapi('callback_conversion', eventId, {
        value: quoteVal,
        currency: 'GBP',
      });

      window.location.href = '/instantquote/thank-you/';
    } catch (error) {
      trackError('MOVE-CB-001', error, { phase: 'request-callback' }, 'ResultPage');
      setCallbackStatus('error');
    }
  }, [callbackStatus, state.contact]);

  const handleRestart = () => {
    clearState();
    window.location.href = '/instantquote/';
  };

  const altQuote = (storeReady && quote)
    ? calculateAlternativeQuote(state, quote)
    : null;

  if (!storeReady) return null;

  // Attribution + loading interstitial
  if (showLoadingScreen) {
    return (
      <QuoteLoadingScreen
        quoteAmount={quote?.totalPrice ?? 0}
        onComplete={() => setShowLoadingScreen(false)}
      />
    );
  }

  // Callback required view
  if (callbackRequired.required) {
    return <CallbackRequiredView state={state} reason={callbackRequired.reason} />;
  }

  // No quote
  if (!quote) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <h2 style={{ fontFamily: V.serif, fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
          Unable to calculate quote
        </h2>
        <p style={{ color: V.midGray, marginBottom: 24 }}>
          Some information may be missing. Please go back and check your details.
        </p>
        <button onClick={() => window.location.href = '/instantquote/'} style={{
          ...ctaStyle, background: V.teal, maxWidth: 320, margin: '0 auto',
        }}>
          Start new calculation
        </button>
      </div>
    );
  }

  const costLines = state.serviceType === 'clearance'
    ? buildClearanceCostBreakdown(quote, state)
    : buildCostBreakdown(quote, state);

  return (
    <>
      <style>{`
        @keyframes qr-fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .qr-animate > * { animation: qr-fadeUp 0.35s ease-out both; }
          .qr-animate > :nth-child(1) { animation-delay: 0s; }
          .qr-animate > :nth-child(2) { animation-delay: 0.06s; }
          .qr-animate > :nth-child(3) { animation-delay: 0.04s; }
          .qr-animate > :nth-child(4) { animation-delay: 0.1s; }
          .qr-meta-animate { animation: qr-fadeUp 0.35s ease-out 0.14s both; }
        }

        .qr-cta-primary {
          display: block;
          width: 100%;
          padding: 16px 24px;
          background: ${V.terracotta};
          color: white;
          font-family: ${V.sans};
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 0.01em;
          text-align: center;
          text-decoration: none;
          border: none;
          border-radius: ${V.radiusSm};
          cursor: pointer;
          box-shadow:
            0 2px 4px rgba(196,93,62,0.18),
            0 4px 12px rgba(196,93,62,0.12);
          transform: translateY(-1px);
          transition:
            background 0.2s ease,
            transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            box-shadow 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .qr-cta-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 40%);
          pointer-events: none;
        }
        .qr-cta-primary:hover {
          background: ${V.terracottaHover};
          transform: translateY(-3px);
          box-shadow:
            0 4px 8px rgba(196,93,62,0.22),
            0 8px 24px rgba(196,93,62,0.16);
        }
        .qr-cta-primary:active {
          transform: translateY(0px);
          box-shadow:
            0 1px 2px rgba(196,93,62,0.2),
            0 2px 4px rgba(196,93,62,0.1);
          transition-duration: 0.08s;
        }
        .qr-cta-primary:disabled {
          opacity: 0.7;
          cursor: default;
          transform: none;
          box-shadow: 0 2px 8px rgba(196,93,62,0.15);
        }

        .qr-grid {
          display: grid;
          grid-template-columns: 57% 1fr;
          gap: 16px;
          align-items: start;
        }
        .qr-grid > :nth-child(1) { grid-column: 1; grid-row: 1; }
        .qr-grid > :nth-child(2) { grid-column: 1; grid-row: 2; }
        .qr-grid > :nth-child(3) { grid-column: 2; grid-row: 1 / 3; }

        @media (max-width: 768px) {
          .qr-grid {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .qr-grid > * { border-radius: 0 !important; }
          .qr-wrapper { margin: 0 auto !important; padding: 0 !important; }
          .qr-price-hero { padding: 32px 24px 28px !important; }
          .qr-price-amount { font-size: 52px !important; }
          .qr-decision-card { padding: 24px 20px 28px !important; }
          .qr-bd-header { padding: 18px 20px 0 !important; }
          .qr-bd-table { padding: 12px 20px 0 !important; }
          .qr-bd-note { padding: 10px 20px 16px !important; }
          .qr-meta-bar {
            border-radius: 0 !important;
            margin-top: 2px !important;
            flex-direction: column !important;
            gap: 6px !important;
            text-align: center !important;
            padding: 16px 20px !important;
          }
          .qr-alt-section {
            border-radius: 0 !important;
            margin-top: 2px !important;
          }
        }
      `}</style>

      <div className="qr-wrapper" style={{ maxWidth: 1060, margin: '48px auto', padding: '0 24px' }}>

        {/* Error alerts */}
        {submissionStatus === 'error' && errorMessage && (
          <div style={{
            background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: V.radiusSm,
            padding: '12px 20px', marginBottom: 16, fontSize: 14, color: '#92400E',
          }}>
            {errorMessage}
          </div>
        )}
        {callbackStatus === 'error' && (
          <div style={{
            background: '#FEE2E2', border: '1px solid #EF4444', borderRadius: V.radiusSm,
            padding: '12px 20px', marginBottom: 16, fontSize: 14, color: '#991B1B',
          }}>
            Failed to submit callback request. Please call us directly on {CALCULATOR_CONFIG.company.phone}.
          </div>
        )}

        {/* ═══ MAIN GRID ═══ */}
        <div className="qr-grid qr-animate">

          {/* 1. PRICE CARD — left col, row 1 */}
          <div style={{
            background: V.warmWhite, borderRadius: V.radius, overflow: 'hidden', boxShadow: V.cardShadow,
          }}>
            <div className="qr-price-hero" style={{
              background: `linear-gradient(145deg, ${V.tealDark} 0%, ${V.teal} 100%)`,
              color: 'white', padding: '40px 36px 32px', textAlign: 'center',
            }}>
              <div style={{
                fontSize: 14, fontWeight: 500, letterSpacing: '0.04em',
                textTransform: 'uppercase' as const, opacity: 0.8, marginBottom: 6,
              }}>
                Your guide price
              </div>
              <div className="qr-price-amount" style={{
                fontFamily: V.serif, fontSize: 68, fontWeight: 700, lineHeight: 1,
                marginBottom: 4, fontFeatureSettings: "'lnum' 1",
              }}>
                £{quote.totalPrice.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 20 }}>
                excl. VAT · valid for 30 days
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.55, opacity: 0.8, maxWidth: 380, margin: '0 auto' }}>
                Final price confirmed after a free survey — we walk through everything together.
              </p>
            </div>

            {/* Social proof bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 24px', background: V.tealLight, fontSize: 14, fontWeight: 500, color: V.teal,
            }}>
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {[
                  { src: `${CONFIG.site.assetBaseUrl}/images/calculator-reviews/john-jones.webp`, alt: 'John' },
                  { src: `${CONFIG.site.assetBaseUrl}/images/calculator-reviews/laura-carnegie-brown.webp`, alt: 'Laura' },
                  { src: `${CONFIG.site.assetBaseUrl}/images/calculator-reviews/emma-henry.webp`, alt: 'Emma' },
                ].map((reviewer, i) => (
                  <div key={i} style={{
                    width: 28, height: 28, borderRadius: '50%', border: `2px solid ${V.tealLight}`,
                    marginLeft: i === 0 ? 0 : -6, overflow: 'hidden', flexShrink: 0,
                  }}>
                    <img src={reviewer.src} alt={reviewer.alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              <span style={{ color: V.goldStar, fontSize: 16, letterSpacing: 2 }} aria-hidden="true">★★★★★</span>
              <span>{REVIEW_STATS.rating}/5 from {REVIEW_STATS.count}+ reviews</span>
            </div>
          </div>

          {/* 2. DECISION CARD — left col, row 2 */}
          <div className="qr-decision-card" style={{
            background: V.warmWhite, borderRadius: V.radius, padding: '28px 28px 32px',
            boxShadow: V.cardShadowLight,
          }}>
            {/* What happens next */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: V.serif, fontSize: 18, fontWeight: 600, marginBottom: 16, color: V.dark }}>
                What happens next
              </h3>
              <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { title: 'We call you within one working day', desc: 'To arrange your free survey at a time that suits you.' },
                  { title: 'Quick video or in-person survey', desc: 'About 15 minutes, completely free.' },
                  { title: 'You receive your personalised quote', desc: 'Final price in writing — no surprises on the day.' },
                ].map((step, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{
                        width: 28, height: 28, background: V.tealLight, color: V.teal,
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {i + 1}
                      </span>
                      {i < 2 && (
                        <span style={{ width: 2, flex: 1, background: V.lightBorder, margin: '3px 0', minHeight: 6 }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: i < 2 ? 12 : 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: V.dark, lineHeight: '28px' }}>
                        {step.title}
                      </div>
                      <div style={{ fontSize: 12, color: V.midGray, lineHeight: 1.4 }}>
                        {step.desc}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* CTA Button */}
            <button
              className="qr-cta-primary"
              onClick={handleRequestCallback}
              disabled={callbackStatus === 'submitting' || callbackStatus === 'success'}
            >
              {callbackStatus === 'submitting'
                ? 'Sending request...'
                : callbackStatus === 'success'
                ? 'Callback requested'
                : 'Get Your Free Survey'}
            </button>

            {/* Tom callback */}
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center', marginTop: 14,
              padding: '12px 14px', background: V.warmGray, borderRadius: V.radiusSm,
            }}>
              <div style={{
                width: 92, height: 92, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: V.teal, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src={`${CONFIG.site.assetBaseUrl}/images/email/tom.webp`} alt="Tom" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <p style={{ fontSize: 13, color: '#4A4740', lineHeight: 1.5, margin: 0 }}>
                <strong style={{ fontWeight: 600, color: V.dark }}>Tom</strong> or one of our team members will call you to arrange a quick, no-cost, no-obligation video call or in-person assessment.
              </p>
            </div>

            {/* Divider + phone */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0', fontSize: 12, color: V.midGray,
            }}>
              <span style={{ flex: 1, height: 1, background: V.lightBorder }} />
              <span>or</span>
              <span style={{ flex: 1, height: 1, background: V.lightBorder }} />
            </div>

            <a
              href={`tel:${CALCULATOR_CONFIG.company.phone.replace(/\s/g, '')}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '13px 20px', background: 'transparent', color: V.dark,
                fontFamily: V.sans, fontSize: 15, fontWeight: 500, textDecoration: 'none',
                border: `1.5px solid ${V.lightBorder}`, borderRadius: V.radiusSm,
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = V.dark)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = V.lightBorder)}
            >
              <span role="img" aria-label="phone">📞</span>
              Call us — {CALCULATOR_CONFIG.company.phone}
            </a>
            <p style={{ textAlign: 'center', fontSize: 12, color: V.midGray, marginTop: 6 }}>
              Mon–Fri 9am–5pm
            </p>
          </div>

          {/* 3. RIGHT COLUMN — video + breakdown stacked tightly */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              background: V.warmWhite, borderRadius: V.radius, overflow: 'hidden', boxShadow: V.cardShadow,
            }}>
              <div style={{ background: '#1a1a1a', position: 'relative', aspectRatio: '16 / 9' }}>
                <iframe
                  src="https://www.youtube-nocookie.com/embed/CBTF-YgAwsw?hl=en&cc_lang_pref=en"
                  title="Painless Removals"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>

            <div style={{
              background: V.warmWhite, borderRadius: V.radius, overflow: 'hidden', boxShadow: V.cardShadowLight,
            }}>
            <h3 className="qr-bd-header" style={{
              fontFamily: V.sans, fontSize: 16, fontWeight: 700, padding: '20px 28px 0', color: V.dark, margin: 0,
            }}>
              Your price breakdown
            </h3>

            {/* Move details */}
            {(state.fromAddress || state.toAddress || state.selectedDate) && (
              <div style={{ padding: '16px 28px 0', fontSize: 13, color: V.midGray, lineHeight: 1.5 }}>
                {state.serviceType === 'clearance' && state.fromAddress && (
                  <div>
                    <div style={{ fontWeight: 600, color: V.dark, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Location</div>
                    <div>{state.fromAddress.formatted.split(',').map((part, i) => (
                      <span key={i}>{i > 0 && <br />}{part.trim()}</span>
                    ))}</div>
                    <div>{state.fromAddress.postcode}</div>
                  </div>
                )}
                {state.serviceType !== 'clearance' && state.fromAddress && state.toAddress && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: V.dark, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>From</div>
                      <div>{state.fromAddress.formatted.split(',').map((part, i) => (
                        <span key={i}>{i > 0 && <br />}{part.trim()}</span>
                      ))}</div>
                      <div>{state.fromAddress.postcode}</div>
                    </div>
                    <span style={{ fontSize: 18, color: V.lightBorder }}>→</span>
                    <div>
                      <div style={{ fontWeight: 600, color: V.dark, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>To</div>
                      <div>{state.toAddress.formatted.split(',').map((part, i) => (
                        <span key={i}>{i > 0 && <br />}{part.trim()}</span>
                      ))}</div>
                      <div>{state.toAddress.postcode}</div>
                    </div>
                  </div>
                )}
                {state.selectedDate && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, color: V.dark, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Date</div>
                    <div>{new Date(state.selectedDate).toLocaleDateString('en-GB', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}</div>
                  </div>
                )}
                {!state.selectedDate && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, color: V.dark, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Date</div>
                    <div>{state.dateFlexibility === 'flexible' ? 'Flexible' : 'To be confirmed'}</div>
                  </div>
                )}
              </div>
            )}

            <div className="qr-bd-table" style={{ padding: '14px 28px 0' }}>
              {costLines.map((line, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '10px 0',
                  borderBottom: i < costLines.length - 1 ? `1px solid ${V.lightBorder}` : 'none',
                }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontSize: 14, color: V.dark, fontWeight: 500 }}>{line.label}</div>
                    {line.detail && (
                      <div style={{ fontSize: 12, color: V.midGray, marginTop: 1 }}>{line.detail}</div>
                    )}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: V.dark, whiteSpace: 'nowrap',
                    fontFeatureSettings: "'tnum' 1",
                  }}>
                    £{line.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <p className="qr-bd-note" style={{
              padding: '14px 28px 18px', fontSize: 12, color: V.midGray, lineHeight: 1.6,
              borderTop: `1px solid ${V.lightBorder}`, marginTop: 10, margin: 0,
            }}>
              Guide price based on the details you've provided. Your personalised quote is confirmed after a free video or in-person survey — no obligation.
            </p>
            </div>
          </div>

        </div>

        {/* ═══ WARNING ZONE (if applicable) ═══ */}
        {quote.warningZone && (
          <div style={{
            marginTop: 16, padding: '14px 28px', background: '#FEF3C7', border: '1px solid #F59E0B',
            borderRadius: V.radius, fontSize: 14, color: '#92400E',
          }}>
            <strong>Important:</strong> This move is on the boundary of a single-day job. We strongly recommend a free video survey so we can plan the most efficient approach.
          </div>
        )}

        {/* ═══ ALTERNATIVE QUOTE — full width ═══ */}
        {altQuote && (
          <div className="qr-alt-section qr-meta-animate" style={{
            marginTop: 16, background: V.warmWhite, borderRadius: V.radius,
            boxShadow: V.cardShadowLight, overflow: 'hidden',
          }}>
            <div style={{ padding: '24px 28px' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start',
              }}>
                {/* Left: description */}
                <div>
                  <h3 style={{ fontFamily: V.serif, fontSize: 18, fontWeight: 600, color: V.dark, marginBottom: 8, margin: 0 }}>
                    {altQuote.serviceDays < quote.serviceDays
                      ? 'This is a borderline case'
                      : `${altQuote.serviceDays}-day option`}
                  </h3>
                  <p style={{ fontSize: 14, color: V.midGray, lineHeight: 1.55, margin: 0 }}>
                    {altQuote.serviceDays < quote.serviceDays
                      ? `Based on what you've told us, your move sits right on the boundary between a ${altQuote.serviceDays}-day and a ${quote.serviceDays}-day job. It's possible we can complete it in a single day — but we can only confirm after a free survey.`
                      : altQuote.serviceDays === 3
                      ? 'Spreading over 3 days makes for a more relaxed schedule — Day 1 loading, Day 2 the drive, Day 3 unloading.'
                      : `Spreading over ${altQuote.serviceDays} days is a smoother option if the volume is larger than expected.`}
                  </p>
                  <p style={{ fontSize: 13, color: V.midGray, lineHeight: 1.55, margin: '10px 0 0' }}>
                    {altQuote.serviceDays < quote.serviceDays
                      ? "We always choose the safest, most comfortable, and most affordable solution. We're showing both options so you know the range — the survey will tell us which side of the line your move falls on."
                      : 'Contact us to discuss which option works best for you.'}
                  </p>
                </div>
                {/* Right: price + details */}
                <div style={{
                  background: V.tealLight, borderRadius: V.radiusSm, padding: '20px 24px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: V.dark }}>
                        {altQuote.serviceDays}-Day Move
                      </div>
                      <div style={{ fontSize: 13, color: V.midGray }}>
                        {altQuote.men} mover{altQuote.men > 1 ? 's' : ''} · {altQuote.vans} van{altQuote.vans > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: V.serif, fontSize: 28, fontWeight: 700, color: V.teal }}>
                        £{altQuote.totalPrice.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, color: V.midGray }}>excl. VAT</div>
                    </div>
                  </div>
                  {/* Compact breakdown */}
                  <div style={{ borderTop: `1px solid ${V.lightBorder}`, paddingTop: 10 }}>
                    {(state.serviceType === 'clearance'
                      ? buildClearanceCostBreakdown(altQuote, state)
                      : buildCostBreakdown(altQuote, state)
                    ).map((line, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', gap: 8,
                        fontSize: 12, color: V.midGray, padding: '3px 0',
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.label}</span>
                        <span style={{ fontFeatureSettings: "'tnum' 1", whiteSpace: 'nowrap' }}>£{line.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ META BAR ═══ */}
        <div className="qr-meta-bar qr-meta-animate" style={{
          marginTop: 16, background: V.warmWhite, borderRadius: V.radius,
          padding: '14px 28px', boxShadow: V.cardShadowLight,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 13, color: V.midGray,
        }}>
          <span>Quote ref: {(state.quoteId || state.sessionId)?.slice(0, 8).toUpperCase()} · Valid for 30 days</span>
          <span>Guide price — personalised quote after survey</span>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleRestart(); }}
            style={{ color: V.teal, textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            ← Start a new calculation
          </a>
        </div>

      </div>
      <ToastContainer />
    </>
  );
}

// ===================
// CTA button base style (for fallback/no-quote state)
// ===================

const ctaStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '16px 24px',
  color: 'white',
  fontFamily: V.sans,
  fontSize: 16,
  fontWeight: 600,
  textAlign: 'center',
  border: 'none',
  borderRadius: V.radiusSm,
  cursor: 'pointer',
};

// ===================
// CALLBACK REQUIRED VIEW
// ===================

function CallbackRequiredView({
  state,
  reason,
}: {
  state: ReturnType<typeof calculatorStore.get>;
  reason?: string | undefined;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    const handleSubmit = async () => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      try {
        const submissionData = getSubmissionData();
        const response = await fetch('/api/callbacks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            contact: state.contact,
            name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
            email: state.contact?.email,
            phone: state.contact?.phone,
            callbackReason: reason,
            data: submissionData,
          }),
        });

        if (response.ok) setEmailSent(true);
        setSubmitted(true);
      } catch (error) {
        trackError('MOVE-CB-001', error, { phase: 'callback-submission' }, 'ResultPage');
        setSubmitted(true);

        setTimeout(async () => {
          try {
            const submissionData = getSubmissionData();
            await fetch('/api/callbacks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(10000),
              body: JSON.stringify({
                contact: state.contact,
                name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
                email: state.contact?.email,
                phone: state.contact?.phone,
                callbackReason: reason,
                data: submissionData,
              }),
            });
          } catch {
            // Silent retry
          }
        }, 3000);
      }
    };

    handleSubmit();
  }, [reason, state.contact]);

  const handleRestart = () => {
    clearState();
    window.location.href = '/instantquote/';
  };

  return (
    <div style={{ maxWidth: 520, margin: '60px auto', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontFamily: V.serif, fontSize: 26, fontWeight: 600, color: V.dark, marginBottom: 8 }}>
          We'll call you soon!
        </h2>
        <p style={{ color: V.midGray }}>
          Thanks {state.contact?.firstName}, we've received your request
        </p>
      </div>

      <div style={{
        background: V.warmWhite, borderRadius: V.radius, padding: 28, boxShadow: V.cardShadowLight, marginBottom: 20,
      }}>
        <h3 style={{ fontFamily: V.serif, fontSize: 18, fontWeight: 600, marginBottom: 20, color: V.dark, textAlign: 'center' }}>
          What happens next?
        </h3>
        {[
          'Our team will review your move requirements',
          "We'll call you as soon as possible (during business hours)",
          "You'll receive a personalized quote by email",
        ].map((text, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 16 : 0 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: V.tealLight, color: V.teal,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {i + 1}
            </div>
            <p style={{ fontSize: 14, color: V.midGray, margin: 0 }}>{text}</p>
          </div>
        ))}
      </div>

      {submitted && emailSent && state.contact?.email && (
        <div style={{
          background: '#ECFDF5', border: '1px solid #10B981', borderRadius: V.radiusSm,
          padding: '12px 20px', marginBottom: 16, fontSize: 14, color: '#065F46',
        }}>
          Confirmation sent to <strong>{state.contact.email}</strong>
        </div>
      )}

      {submitted && !emailSent && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: V.radiusSm,
          padding: '12px 20px', marginBottom: 16, fontSize: 14, color: '#92400E',
        }}>
          Your request has been received. If you don't hear from us, please call {CALCULATOR_CONFIG.company.phone}.
        </div>
      )}

      <div style={{
        background: V.warmWhite, borderRadius: V.radius, padding: '16px 20px',
        boxShadow: V.cardShadowLight, marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.dark, marginBottom: 8 }}>Your contact details</h3>
        <div style={{ fontSize: 14, color: V.midGray, lineHeight: 1.8 }}>
          <p style={{ margin: 0 }}>{state.contact?.firstName} {state.contact?.lastName}</p>
          <p style={{ margin: 0 }}>{state.contact?.phone}</p>
          <p style={{ margin: 0 }}>{state.contact?.email}</p>
        </div>
      </div>

      <a
        href={`tel:${CALCULATOR_CONFIG.company.phone.replace(/\s/g, '')}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '13px 20px', background: 'transparent', color: V.dark,
          fontFamily: V.sans, fontSize: 15, fontWeight: 500, textDecoration: 'none',
          border: `1.5px solid ${V.lightBorder}`, borderRadius: V.radiusSm, marginBottom: 12,
        }}
      >
        📞 Call us: {CALCULATOR_CONFIG.company.phone}
      </a>

      <button
        onClick={handleRestart}
        style={{
          display: 'block', width: '100%', padding: '12px 20px',
          background: 'transparent', color: V.midGray, border: 'none',
          fontFamily: V.sans, fontSize: 14, cursor: 'pointer', textAlign: 'center',
        }}
      >
        Start a new calculation
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, color: V.midGray, marginTop: 20 }}>
        Reference: {state.sessionId?.slice(0, 8).toUpperCase()}
        <br />
        Business hours: Mon–Fri 9am–5pm
      </p>
    </div>
  );
}

// ===================
// HELPERS
// ===================

export default ResultPage;
