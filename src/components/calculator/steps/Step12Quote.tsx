/**
 * STEP 12: FINAL QUOTE
 *
 * Displays:
 * - Final price (big, prominent)
 * - Full breakdown (expandable)
 * - Move summary
 * - Booking options (Book now / Request callback)
 *
 * Actions:
 * - Submit quote to backend
 * - Send confirmation email
 * - Track conversion
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  quoteResult,
  requiresCallback,
  finalResources,
  getSubmissionData,
  prevStep,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
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

export function Step12Quote() {
  const state = useStore(calculatorStore);
  const quote = useStore(quoteResult);
  const callbackRequired = useStore(requiresCallback);
  const resources = useStore(finalResources);

  const [showBreakdown, setShowBreakdown] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callbackStatus, setCallbackStatus] = useState<CallbackStatus>('idle');

  // Track if we've already submitted to prevent double submission
  const hasSubmittedRef = useRef(false);

  // Use ref for submission guard to avoid stale closure issues
  const submissionStatusRef = useRef<SubmissionStatus>('idle');

  // Submit quote to backend
  const submitQuote = useCallback(async () => {
    if (submissionStatusRef.current === 'submitting' || submissionStatusRef.current === 'success') return;
    if (!quote) return; // Don't submit if no quote

    submissionStatusRef.current = 'submitting';
    setSubmissionStatus('submitting');
    setErrorMessage(null);

    try {
      const submissionData = getSubmissionData();

      // Generate event_id up-front so the server-side GA4 MP mirror
      // (fired from save-quote.ts) carries the same id as the
      // browser-side dataLayer push and the eventual conversion.
      const eventId = generateUUID();

      // Format data for save-quote API
      const apiData = {
        data: submissionData,
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
        event_id: eventId,
      };

      const response = await fetch('/api/save-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error('Failed to submit quote');
      }

      const result = await response.json() as { quoteId?: string };

      // Push PII to the DOM side-channel for GTM User-Provided Data
      // variable. NEVER through dataLayer.
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

      // Start the 60-min upgrade window. Conversion fires later: either
      // when the user upgrades (phone/email/whatsapp/callback click) or
      // when the timer elapses without an upgrade. Reuse the same
      // event_id that went to save-quote so all hits for this
      // conversion (server engagement, browser engagement, eventual
      // conversion + Meta CAPI mirror) share one dedup key.
      const quoteState = resetQuoteState({
        value: quote.totalPrice,
        service: state.serviceType || 'removal',
        eventId,
      });

      // Engagement event — fires every completion.
      trackEvent('quote_calculator_complete', {
        event_id: quoteState.eventId,
        quote_id: result.quoteId,
        quote_value: quote.totalPrice,
        value: quote.totalPrice,
        currency: 'GBP',
        service: state.serviceType || 'removal',
      });

      // Meta ViewContent — only the FIRST completion in this browser, no
      // value (engagement signal only, not optimization input).
      // Reads the dedicated VIEW_CONTENT_FIRED_KEY localStorage flag.
      if (!hasViewContentFired()) {
        trackEvent('quote_calculator_first_view', {
          event_id: quoteState.eventId,
          service: state.serviceType || 'removal',
        });
        void mirrorMetaCapi('quote_calculator_first_view', quoteState.eventId, {});
        markViewContentFired();
      }

      submissionStatusRef.current = 'success';
      setSubmissionStatus('success');
    } catch (error) {
      trackError('MOVE-QUOTE-001', error, { phase: 'submit-quote' }, 'Step12Quote');
      submissionStatusRef.current = 'error';
      setSubmissionStatus('error');
      setErrorMessage(
        "There was a problem saving your quote. Don't worry - your quote is still valid!"
      );
    }
  }, [quote, state.contact, state.utmSource, state.utmMedium, state.utmCampaign, state.gclid, state.serviceType]);

  // Auto-submit quote on mount (only once)
  useEffect(() => {
    if (!hasSubmittedRef.current && quote) {
      hasSubmittedRef.current = true;
      submitQuote();
    }
  }, [submitQuote, quote]);

  // Show toast when email confirmation is sent
  useEffect(() => {
    if (submissionStatus === 'success' && state.contact?.email) {
      toast.success(
        `We've sent a copy of this quote to ${state.contact.email}. Use the link in that email to access your quote anytime.`,
        8000
      );
    }
  }, [submissionStatus, state.contact?.email]);

  // Handle booking request — programmatic phone dial. The global click
  // listener won't see this (no <a href="tel:"> click), so we fire the
  // conversion explicitly. `getActiveQuoteState` is the only correct
  // gate for "after_calculator" attribution: the calculator-store
  // `quote` is still truthy after the upgrade window has expired or
  // already fired late, but those clicks are no longer real upgrades.
  const handleBookNow = () => {
    const tel = CALCULATOR_CONFIG.company.phone.replace(/\s/g, '');
    const active = getActiveQuoteState();
    const eventId = active ? active.eventId : generateUUID();
    const quoteVal = active ? active.value : 0;
    const service = active ? active.service : state.serviceType || 'removal';
    if (active) markQuoteUpgraded();
    trackEvent('phone_conversion', {
      event_id: eventId,
      value: quoteVal,
      currency: 'GBP',
      service,
      source: active ? 'after_calculator' : 'standalone',
      tel_target: tel,
    });
    void mirrorMetaCapi('phone_conversion', eventId, {
      value: quoteVal,
      currency: 'GBP',
    });
    window.location.href = `tel:${tel}`;
  };

  // Handle callback request via API
  const handleRequestCallback = useCallback(async () => {
    if (callbackStatus === 'submitting' || callbackStatus === 'success') return;

    setCallbackStatus('submitting');

    try {
      const submissionData = getSubmissionData();

      const response = await fetch('/api/callbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: state.contact,
          name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
          email: state.contact?.email,
          phone: state.contact?.phone,
          callbackReason: 'Customer requested callback from quote page',
          data: submissionData,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error('Failed to submit callback request');
      }

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

      setCallbackStatus('success');
    } catch (error) {
      trackError('MOVE-CB-001', error, { phase: 'request-callback' }, 'Step12Quote');
      setCallbackStatus('error');
    }
  }, [state.contact, quote, state.serviceType]);

  // If callback required (specialist items or >2000 cubes)
  if (callbackRequired.required) {
    return <CallbackRequiredView state={state} {...(callbackRequired.reason !== undefined && { reason: callbackRequired.reason })} />;
  }

  // If no quote calculated - show error with option to go back
  if (!quote) {
    const missingItems = [];
    if (!state.fromAddress) missingItems.push('Moving from address not set');
    if (!state.toAddress) missingItems.push('Moving to address not set');
    if (!state.distances) missingItems.push('Route distances not calculated');
    if (!state.propertySize && !state.furnitureOnly) missingItems.push('Property size not selected');
    if (!resources) missingItems.push('Unable to calculate resources - please check property details');

    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-semibold text-foreground">
            Unable to calculate quote
          </h2>
          <p className="text-muted-foreground mt-2">
            Some information may be missing. Please go back and check your details.
          </p>
        </div>

        {missingItems.length > 0 && (
          <Card className="p-4">
            <h3 className="font-medium text-foreground mb-2">Missing information:</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              {missingItems.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </Card>
        )}

        <Button onClick={prevStep} className="w-full" size="lg">
          ← Go back and fix
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-semibold text-foreground">
          Your quote is ready!
        </h2>
        <p className="text-muted-foreground mt-2">
          Hi {state.contact?.firstName}, here's your instant quote
        </p>
      </div>

      {/* Main Price Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
        <div className="text-center">
          {/* Price */}
          <div className="mb-2">
            <span className="text-sm text-muted-foreground">
              Your estimated price
            </span>
          </div>
          <div className="text-5xl font-bold text-primary mb-2">
            £{quote.totalPrice.toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground">
            Excluding VAT • Valid for 30 days
          </div>

          {/* Date */}
          {state.selectedDate && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-background rounded-full border">
              <span>📅</span>
              <span className="font-medium">
                {new Date(state.selectedDate).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {state.dateFlexibility === 'flexible' && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  Flexible
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Move Summary */}
      <Card className="p-4">
        <h3 className="font-semibold text-foreground mb-3">Your move</h3>
        <div className="space-y-3">
          {/* Route */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-medium">
                A
              </div>
              <div className="w-0.5 h-8 bg-border"></div>
              <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium">
                B
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {state.fromAddress?.formatted}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {state.distances?.customerDistance} miles •{' '}
                {formatDuration(state.distances?.customerDriveMinutes || 0)}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {state.toAddress?.formatted}
                </p>
              </div>
            </div>
          </div>

          {/* Resources */}
          <div className="flex gap-4 pt-3 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚚</span>
              <span className="text-sm">
                <strong>{quote.vans}</strong> van{quote.vans > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👷</span>
              <span className="text-sm">
                <strong>{quote.men}</strong> mover{quote.men > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⏱️</span>
              <span className="text-sm">
                <strong>{quote.serviceDuration}</strong>
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Warning Zone Alert (v4.2: 10-12h jobs) */}
      {quote.warningZone && (
        <Alert className="border-amber-500 bg-amber-50">
          <AlertDescription className="text-amber-800">
            <strong>Important:</strong> This move is on the boundary of a single-day job. Depending on access and the amount of belongings, it could become a 2-day move which significantly increases the cost. We strongly recommend a free video survey so we can plan the most efficient approach and keep your move to a single day.
          </AlertDescription>
        </Alert>
      )}

      {/* Split-Day Breakdown (v4.2) */}
      {quote.splitDayBreakdown && quote.splitDayBreakdown.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Your move plan</h3>
          <div className="space-y-2">
            {quote.splitDayBreakdown.map((day) => (
              <div key={day.day} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-medium shrink-0">
                  {day.day}
                </div>
                <div className="flex-1">
                  <span className="font-medium">Day {day.day}:</span>{' '}
                  <span className="text-muted-foreground">{day.label}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ~{day.hours.toFixed(1)}h
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Price Breakdown (Collapsible) — v4.2 */}
      <Card className="overflow-hidden">
        <button
          type="button"
          className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
          onClick={() => setShowBreakdown(!showBreakdown)}
        >
          <span className="font-semibold text-foreground">Price breakdown</span>
          <span
            className={cn('transition-transform', showBreakdown && 'rotate-180')}
          >
            ▼
          </span>
        </button>

        {showBreakdown && (() => {
          // Bake margin into controllable line items so we never expose raw costs
          const b = quote.breakdown;
          const marginRatio = b.controllableCost > 0 ? b.marginedTotal / b.controllableCost : 1;

          return (
            <div className="p-4 pt-0 space-y-2 text-sm">
              {/* Crew cost (margin included) */}
              <BreakdownLine
                label={`${quote.men} mover${quote.men > 1 ? 's' : ''} crew cost`}
                value={Math.round(b.crewCost * marginRatio)}
              />

              {/* Van cost (margin included) */}
              <BreakdownLine
                label={`${quote.vans} van${quote.vans > 1 ? 's' : ''} × ${quote.serviceDuration}`}
                value={Math.round(b.vansCost * marginRatio)}
              />

              {/* Surcharge (margin included) */}
              {quote.surcharge && quote.surcharge.amount > 0 && (
                <BreakdownLine
                  label={`${quote.surcharge.type === 'saturday' ? 'Saturday' : 'Bank holiday'} surcharge`}
                  value={Math.round(b.surchargeCost * marginRatio)}
                />
              )}

              {/* Mileage */}
              {b.mileageCost > 0 && (
                <BreakdownLine
                  label={`Mileage (${getTotalMiles(state.distances)} miles)`}
                  value={Math.round(b.mileageCost)}
                />
              )}

              {/* Accommodation */}
              {b.accommodationCost > 0 && (
                <BreakdownLine
                  label="Crew accommodation (overnight)"
                  value={Math.round(b.accommodationCost)}
                />
              )}

              {/* Key Wait Waiver */}
              {b.keyWaitWaiverCost > 0 && (
                <BreakdownLine
                  label="Key Wait Waiver"
                  value={Math.round(b.keyWaitWaiverCost)}
                />
              )}

              {/* Extras */}
              {b.extrasCost > 0 && (
                <BreakdownLine
                  label="Extra services"
                  value={Math.round(b.extrasCost)}
                />
              )}

              {/* Total */}
              <hr className="my-2 border-border" />
              <BreakdownLine label="Total" value={quote.totalPrice} bold large />
            </div>
          );
        })()}
      </Card>

      {/* Extras Summary (if any) */}
      {hasExtras(state.extras) && (
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Included extras</h3>
          <div className="space-y-2 text-sm">
            {state.extras.packing && (
              <div className="flex items-center gap-2">
                <span>📦</span>
                <span>
                  Professional packing (
                  {CALCULATOR_CONFIG.packing[state.extras.packing].label})
                </span>
              </div>
            )}
            {state.extras.cleaningRooms && (
              <div className="flex items-center gap-2">
                <span>🧹</span>
                <span>
                  End of tenancy cleaning ({state.extras.cleaningRooms} rooms)
                </span>
              </div>
            )}
            {state.extras.storage && (
              <div className="flex items-center gap-2">
                <span>🏠</span>
                <span>
                  Storage ({CALCULATOR_CONFIG.storage[state.extras.storage].label}
                  )
                </span>
              </div>
            )}
            {state.extras.assembly && state.extras.assembly.length > 0 && (
              <div className="flex items-center gap-2">
                <span>🔧</span>
                <span>
                  Assembly/disassembly ({state.extras.assembly.length} item
                  {state.extras.assembly.length > 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Error Alert */}
      {submissionStatus === 'error' && errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Callback Success */}
      {callbackStatus === 'success' && (
        <Alert className="border-emerald-500 bg-emerald-50">
          <AlertDescription className="text-emerald-800">
            📞 Callback request sent! We'll be in touch during business hours.
          </AlertDescription>
        </Alert>
      )}

      {/* Callback Error */}
      {callbackStatus === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to submit callback request. Please call us directly on {CALCULATOR_CONFIG.company.phone}.
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button onClick={handleBookNow} className="w-full" size="lg">
          Book this date
        </Button>

        <Button
          onClick={handleRequestCallback}
          variant="outline"
          className="w-full"
          disabled={callbackStatus === 'submitting' || callbackStatus === 'success'}
        >
          {callbackStatus === 'submitting' ? (
            <>Sending request...</>
          ) : callbackStatus === 'success' ? (
            <>✓ Callback requested</>
          ) : (
            <>📞 Request a callback to discuss</>
          )}
        </Button>

        <Button
          onClick={prevStep}
          variant="ghost"
          className="w-full"
        >
          ← Edit my details
        </Button>
      </div>

      {/* Trust Signals */}
      <div className="text-center space-y-4">
        <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <span>✓ No booking fee</span>
          <span>✓ Free cancellation (48h+)</span>
          <span>✓ Fully insured</span>
        </div>

        {/* Reviews */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-amber-500">★★★★★</span>
          <span className="text-sm text-muted-foreground">
            {REVIEW_STATS.rating}/5 from {REVIEW_STATS.count}+ reviews
          </span>
        </div>
      </div>

      {/* Fine Print */}
      <p className="text-xs text-center text-muted-foreground">
        Quote reference: {state.sessionId?.slice(0, 8).toUpperCase()}
        <br />
        Valid until {getValidUntilDate()}. Price may vary if move details change.
      </p>
    </div>
  );
}

// ===================
// SUB-COMPONENTS
// ===================

interface BreakdownLineProps {
  label: string;
  value: number | null;
  note?: string;
  bold?: boolean;
  large?: boolean;
}

function BreakdownLine({ label, value, note, bold, large }: BreakdownLineProps) {
  return (
    <div
      className={cn(
        'flex justify-between items-center',
        bold && 'font-semibold',
        large && 'text-lg'
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(bold && 'text-foreground')}>
        {value !== null ? `£${value.toLocaleString()}` : '—'}
        {note && (
          <span className="text-xs text-muted-foreground ml-1">{note}</span>
        )}
      </span>
    </div>
  );
}

// ===================
// CALLBACK REQUIRED VIEW
// ===================

interface CallbackRequiredViewProps {
  state: ReturnType<typeof calculatorStore.get>;
  reason?: string;
}

function CallbackRequiredView({ state, reason }: CallbackRequiredViewProps) {
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
          body: JSON.stringify({
            contact: state.contact,
            name: state.contact ? `${state.contact.firstName} ${state.contact.lastName}` : undefined,
            email: state.contact?.email,
            phone: state.contact?.phone,
            callbackReason: reason,
            data: submissionData,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          setEmailSent(true);
        }
        setSubmitted(true);
      } catch (error) {
        trackError('MOVE-CB-001', error, { phase: 'callback-submission' }, 'Step12Quote');
        setSubmitted(true);
      }
    };

    handleSubmit();
  }, [reason, state.contact]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">📞</div>
        <h2 className="text-2xl font-semibold text-foreground">
          We'll call you soon!
        </h2>
        <p className="text-muted-foreground mt-2">
          Thanks {state.contact?.firstName}, we've received your request
        </p>
      </div>

      <Card className="p-6 text-center">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          What happens next?
        </h3>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-medium">
              1
            </div>
            <p className="text-left">
              Our team will review your move requirements
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-medium">
              2
            </div>
            <p className="text-left">
              We'll call you as soon as possible (during business hours)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-medium">
              3
            </div>
            <p className="text-left">
              You'll receive a personalized quote by email
            </p>
          </div>
        </div>
      </Card>

      {submitted && emailSent && state.contact?.email && (
        <Alert className="border-emerald-500 bg-emerald-50">
          <AlertDescription className="text-emerald-800">
            ✉️ Confirmation sent to <strong>{state.contact?.email}</strong>
          </AlertDescription>
        </Alert>
      )}

      {submitted && !emailSent && (
        <Alert className="border-amber-500 bg-amber-50">
          <AlertDescription className="text-amber-800">
            Your request has been received. If you don't hear from us, please call {CALCULATOR_CONFIG.company.phone}.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-4 bg-muted/30">
        <h3 className="font-medium text-foreground text-sm mb-2">
          Your contact details
        </h3>
        <div className="text-sm space-y-1">
          <p>
            {state.contact?.firstName} {state.contact?.lastName}
          </p>
          <p>{state.contact?.phone}</p>
          <p>{state.contact?.email}</p>
        </div>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Reference: {state.sessionId?.slice(0, 8).toUpperCase()}
        <br />
        Business hours: Mon-Sat 8am-6pm
      </p>
    </div>
  );
}

// ===================
// HELPER FUNCTIONS
// ===================

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function getValidUntilDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + CALCULATOR_CONFIG.validation.quoteValidDays);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getTotalMiles(
  distances: { depotToFrom: number; fromToTo: number; toToDepot: number } | null
): number {
  if (!distances) return 0;
  return Math.round(
    distances.depotToFrom + distances.fromToTo + distances.toToDepot
  );
}

function hasExtras(extras: {
  packing?: string;
  cleaningRooms?: number;
  storage?: string;
  assembly?: Array<{ type: string; quantity: number }>;
}): boolean {
  return Boolean(
    extras?.packing ||
      extras?.cleaningRooms ||
      extras?.storage ||
      (extras?.assembly && extras.assembly.length > 0)
  );
}

export default Step12Quote;
