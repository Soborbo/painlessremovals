/**
 * Painless Removals site adapter for the generic funnel factory
 * (verify/e2e/funnel-factory.ts).
 *
 * Knows the three site-specific things the factory can't:
 *   1. how to seed a COMPLETED calculator run into the browser so the
 *      results page (/instantquote/your-quote/) auto-submits + converts,
 *   2. which selectors/events/paths this site uses,
 *   3. which of the site's own APIs must be stubbed so a test run creates
 *      no email / CRM lead / DB row (save-quote, callbacks).
 *
 * Selector evidence (src/components/calculator/ResultPage.tsx):
 *   - callback CTA:  <button className="qr-cta-primary"
 *                      onClick={handleRequestCallback} ...>
 *                      ... 'Get Your Free Survey'</button>
 *     `.qr-cta-primary` is unique to that button on the results page.
 *   - tel link:      <a href={`tel:${CALCULATOR_CONFIG.company.phone
 *                      .replace(/\s/g, '')}`} ...> inside the
 *     `.qr-decision-card` div — scoping to the card keeps the assertion on
 *     the results-page CTA even if a layout ever grows another tel: link
 *     (your-quote.astro is standalone: no site header/footer nav).
 */

import type { Page } from '@playwright/test';
import type { SiteAdapter } from '../verify/e2e/funnel-factory';
import { baseSeed, mutatedSeed } from './seed';

/** Must match SESSION_KEY in src/lib/calculator-store.ts. */
const CALC_STATE_KEY = 'painless_calc_state';

/**
 * localStorage keys owned by the tracking layer
 * (src/lib/tracking/config.ts / conversion-state.ts):
 *   pl_quote_state:fired    — fired-guard: event_id of the already-fired
 *                             quote conversion
 *   pl_quote_completed_at   — recent-quote record (feeds phone-click value)
 *   pl_view_content_fired   — Meta ViewContent once-per-browser flag
 *   painless_quote          — loading-screen attribution blob
 */
const FIRED_GUARD_KEY = 'pl_quote_state:fired';
const COMPLETED_AT_KEY = 'pl_quote_completed_at';
const VIEW_CONTENT_KEY = 'pl_view_content_fired';
const LOADING_ATTRIBUTION_KEY = 'painless_quote';

/**
 * The results page always shows QuoteLoadingScreen — an 8s
 * requestAnimationFrame-driven interstitial — before mounting the quote
 * (auto-submit + conversion only run after it completes). 8.5s per page
 * load would blow the factory's fixed 10s poll in the changed-quote
 * scenario and push the refresh re-fire outside its 2.5s observation
 * window. This init script fast-forwards ONLY the rAF timestamp clock
 * (+10 min per frame) so duration-based rAF animations finish on their
 * first frame; nothing else on these pages animates via rAF (React uses
 * MessageChannel, CSS animations are unaffected).
 */
function fastForwardRafTimestamps(): void {
  const w = window as unknown as { __e2eRafFastForward?: boolean };
  if (w.__e2eRafFastForward) return;
  w.__e2eRafFastForward = true;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    orig((t) => cb(t + 10 * 60 * 1000));
}

/** addInitScript must only be registered once per Page (the changed-quote
 *  scenario calls seedCompletedState twice on the same page). */
const rafPatched = new WeakSet<Page>();

export const adapter: SiteAdapter = {
  baseUrl: process.env.VERIFY_BASE_URL || 'http://127.0.0.1:4321',
  resultPath: '/instantquote/your-quote/',
  events: {
    primary: 'quote_calculator_conversion',
    callback: 'callback_conversion',
    phone: 'phone_conversion',
  },
  // Canonical wire names: CANONICAL_EVENT map in
  // src/lib/tracking/worker-dispatch.ts.
  gatewayNames: {
    primary: 'quote_calculator_submitted',
    callback: 'callback_request_submitted',
    phone: 'phone_number_clicked',
  },
  thankYouPath: /\/instantquote\/thank-you\/?/,
  telSelector: '.qr-decision-card a[href^="tel:"]',
  callbackSelector: 'button.qr-cta-primary',

  async seedCompletedState(page, variant) {
    if (!rafPatched.has(page)) {
      rafPatched.add(page);
      await page.addInitScript(fastForwardRafTimestamps);
    }

    const seed = variant.mutate ? mutatedSeed : baseSeed;
    await page.evaluate(
      (args) => {
        const state: Record<string, unknown> = { ...args.seed, gclid: args.gclid };

        if (args.mutate) {
          // A real user who goes back and changes an input KEEPS the
          // previous completion's event_id + quote signature in the
          // sessionStorage-backed store — carrying them over is what makes
          // the changed-quote scenario actually exercise the stale
          // fired-guard path (a wiped completionEventId would mint a fresh
          // id trivially and mask a broken signature comparison).
          try {
            const current = JSON.parse(
              sessionStorage.getItem(args.calcStateKey) || 'null',
            ) as Record<string, unknown> | null;
            if (current && typeof current === 'object') {
              state.completionEventId = current.completionEventId ?? null;
              state.completionQuoteSignature = current.completionQuoteSignature ?? null;
            }
          } catch {
            /* no prior state — seed as-is */
          }
        } else {
          // Fresh-completion seeds start from a clean tracking slate
          // (fresh browser context per test anyway — this is belt and
          // braces for reused contexts / local debugging).
          for (const key of args.clearKeys) {
            try {
              localStorage.removeItem(key);
            } catch {
              /* storage unavailable */
            }
          }
        }

        sessionStorage.setItem(args.calcStateKey, JSON.stringify(state));

        // Attribution store read by utm-capture.ts (readAttribution) —
        // feeds save-quote's gclid fallback and CRM attribution.
        sessionStorage.setItem(
          'pr_tracking',
          JSON.stringify({
            gclid: args.gclid,
            utm_source: 'e2e',
            _landing: '/e2e/',
            _ts: new Date().toISOString(),
          }),
        );

        // Attribution store read by worker-tracking.ts collectAttribution()
        // — this is what surfaces as `attribution.gclid` in the gateway
        // dispatch payload the factory asserts on.
        localStorage.setItem(
          '__sb_attribution',
          JSON.stringify({ gclid: args.gclid, utm_source: 'e2e', landing_page: '/e2e/' }),
        );

        // collectAttribution() is consent-gated: click IDs are dropped
        // unless ad consent is GRANTED. Seed the CookieYes cookie the
        // consent readers (worker-tracking getConsentState / tracking.ts
        // adStorageConsent) parse, exactly as a consented visitor has it.
        document.cookie =
          'cookieyes-consent=consentid:e2e,consent:yes,necessary:yes,' +
          'functional:yes,analytics:yes,performance:yes,advertisement:yes,' +
          'other:yes; path=/; SameSite=Lax';
      },
      {
        seed,
        gclid: variant.gclid,
        mutate: !!variant.mutate,
        calcStateKey: CALC_STATE_KEY,
        clearKeys: [FIRED_GUARD_KEY, COMPLETED_AT_KEY, VIEW_CONTENT_KEY, LOADING_ATTRIBUTION_KEY],
      },
    );
  },

  async stubSiteApis(page) {
    const saves: Array<Record<string, unknown>> = [];
    const callbacks: Array<Record<string, unknown>> = [];

    const parseBody = (postData: string | null): Record<string, unknown> => {
      try {
        const parsed: unknown = JSON.parse(postData ?? '{}');
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    };

    await page.route('**/api/save-quote', async (route) => {
      saves.push(parseBody(route.request().postData()));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, quoteId: 'E2E-TEST-1', crmSynced: true }),
      });
    });

    await page.route('**/api/callbacks', async (route) => {
      callbacks.push(parseBody(route.request().postData()));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Not a tracking surface: the results page embeds a YouTube iframe.
    // Kill it so an unreachable/slow youtube-nocookie.com can never stall
    // `networkidle` or spam the logs.
    await page.route('**/*youtube-nocookie.com/**', (route) => route.abort());

    return { saves: () => saves, callbacks: () => callbacks };
  },
};
