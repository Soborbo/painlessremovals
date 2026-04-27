/**
 * Page-level click + scroll listeners.
 *
 * - phone/email/whatsapp link clicks → conversion event, with upgrade
 *   logic if there's an active quote in the upgrade window
 * - scroll depth (50%, 90%) → engagement events
 *
 * No cleanup logic: the calculator runs on hard page-loads (Astro MPA,
 * no View Transitions), so listeners are released when the page
 * unloads. Adding `AbortController` plumbing here would just be dead
 * weight.
 */

import { getActiveQuoteState, markQuoteUpgraded } from './conversion-state';
import { mirrorMetaCapi } from './meta-mirror';
import { trackEvent } from './tracking';
import { generateUUID } from './uuid';

let installed = false;

export function initGlobalListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  document.addEventListener('click', onDocumentClick, true);
  installScrollDepthTracking();
}

function onDocumentClick(e: Event): void {
  const target = e.target as HTMLElement | null;
  const link = target?.closest?.('a');
  if (!link) return;

  const href = link.getAttribute('href') || '';

  // Instant Quote CTA click — analytics only, NOT a conversion.
  // Counts intent on every page that links into the calculator.
  if (
    href === '/instantquote/' ||
    href === '/instantquote' ||
    href.startsWith('/instantquote/?') ||
    href.startsWith('/instantquote?')
  ) {
    trackEvent('instant_quote_cta_click', {
      source_page: window.location.pathname,
    });
    return;
  }

  let eventName: string | null = null;
  let extras: Record<string, unknown> = {};

  if (href.startsWith('tel:')) {
    eventName = 'phone_conversion';
    extras = { tel_target: href.slice(4) };
  } else if (href.startsWith('mailto:')) {
    eventName = 'email_conversion';
  } else if (/(?:^|\/\/)(?:[^/]*\.)?(wa\.me|whatsapp\.com)/i.test(href)) {
    eventName = 'whatsapp_conversion';
  }
  if (!eventName) return;

  const active = getActiveQuoteState();
  const eventId = active ? active.eventId : generateUUID();

  if (active) {
    markQuoteUpgraded();
    trackEvent(eventName, {
      event_id: eventId,
      value: active.value,
      currency: active.currency,
      service: active.service,
      source: 'after_calculator',
      ...extras,
    });
    void mirrorMetaCapi(eventName, eventId, {
      value: active.value,
      currency: active.currency,
    });
  } else {
    trackEvent(eventName, {
      event_id: eventId,
      source: 'standalone',
      ...extras,
    });
    void mirrorMetaCapi(eventName, eventId, {});
  }
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
