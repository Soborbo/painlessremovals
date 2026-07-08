/**
 * Page-level click + scroll listeners.
 *
 * - phone/email/whatsapp link clicks → their own conversion events
 *   (`source: after_calculator` is a reporting label only — the quote
 *   conversion fires separately, at completion). If a quote was just
 *   completed, the click also carries that quote's value/currency/
 *   service as its monetary signal — mirrors what the in-page
 *   callback/book-now handlers attach from their local React state,
 *   which this global DOM listener doesn't have access to.
 * - scroll depth (50%, 90%) → engagement events
 *
 * No cleanup logic: the calculator runs on hard page-loads (Astro MPA,
 * no View Transitions), so listeners are released when the page
 * unloads. Adding `AbortController` plumbing here would just be dead
 * weight.
 */

import { getRecentQuoteDetails } from './conversion-state';
import { readUserDataFromDOM, trackEvent } from './tracking';
import { dispatchWorkerConversion } from './worker-dispatch';
import { generateUUID } from './uuid';

let installed = false;

export function initGlobalListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  document.addEventListener('click', onDocumentClick, true);
  installScrollDepthTracking();
}

/** Same-site pathname for relative AND absolute hrefs; null for
 *  cross-origin / unparseable / non-http(s) links. */
function sameSitePathname(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname !== window.location.hostname) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function onDocumentClick(e: Event): void {
  const target = e.target as HTMLElement | null;
  const link = target?.closest?.('a');
  if (!link) return;

  const href = link.getAttribute('href') || '';

  let eventName: string | null = null;
  let extras: Record<string, unknown> = {};

  if (href.startsWith('tel:')) {
    eventName = 'phone_conversion';
    extras = { tel_target: href.slice(4) };
  } else if (href.startsWith('mailto:')) {
    eventName = 'email_conversion';
  } else if (/(?:^|\/\/)(?:[^/]*\.)?(wa\.me|whatsapp\.com)/i.test(href)) {
    eventName = 'whatsapp_conversion';
  } else {
    // Instant Quote CTA click — analytics only, NOT a conversion. Counts
    // intent on every page that links into the calculator; handles both
    // relative and absolute same-site URLs.
    const path = sameSitePathname(href);
    if (path === '/instantquote' || path === '/instantquote/') {
      trackEvent('instant_quote_cta_click', {
        source_page: window.location.pathname,
      });
    }
    return;
  }

  const eventId = generateUUID();
  // event_id is fresh — the quote conversion already fired at completion
  // and this click is its own conversion. Its value/currency/service ride
  // along ONLY when a quote was just completed (recent-quote cache);
  // `source` is a reporting label, it gates no firing decisions.
  const recentQuote = getRecentQuoteDetails();
  const source = recentQuote ? 'after_calculator' : 'standalone';

  // dataLayer push (browser GA4 / Meta Pixel / Google Ads via GTM).
  trackEvent(eventName, {
    event_id: eventId,
    source,
    ...(recentQuote ? { value: recentQuote.value, currency: recentQuote.currency, service: recentQuote.service } : {}),
    ...extras,
  });

  // Server-side leg: the Soborbo Worker (Meta CAPI), same event_id as the
  // dataLayer push above so Meta dedups browser + server. Raw user_data comes
  // from the DOM side-channel; the Worker hashes it.
  dispatchWorkerConversion(eventName, eventId, {
    source,
    ...(recentQuote ? { value: recentQuote.value, currency: recentQuote.currency, service: recentQuote.service } : {}),
    userData: readUserDataFromDOM(),
  });
}

function installScrollDepthTracking(): void {
  let fired50 = false;
  let fired90 = false;
  const onScroll = () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight;
    if (!total) return;
    const pct = ((window.scrollY + window.innerHeight) / total) * 100;
    if (pct >= 50 && !fired50) {
      fired50 = true;
      trackEvent('scroll_50');
    }
    if (pct >= 90 && !fired90) {
      fired90 = true;
      trackEvent('scroll_90');
    }
    if (fired50 && fired90) {
      window.removeEventListener('scroll', onScroll);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}
