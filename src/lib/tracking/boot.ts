/**
 * One-shot client bootstrap. Imported from a bundled `<script>` block in
 * page layouts so it runs once per page-load.
 *
 * No View Transitions hooks: the site runs as a hard-navigation MPA.
 */

import { cleanupLegacyQuoteState } from './conversion-state';
import { initGlobalListeners } from './global-listeners';
import { restoreUserDataFromStorage, setUserDataOnDOM } from './tracking';
import { captureUTMs, readAffiliateCode, buildAttribution } from './utm-capture';
import { dispatchWorkerConversion } from './worker-dispatch';
import { prewarmTurnstileToken } from '@/lib/worker-tracking';
import { pushLeadToCRM } from '@/lib/crm/push-lead';

captureUTMs();
// Rehydrate the hidden PII side-channel from localStorage (consent-gated
// inside: hydrates only on an explicit ad_storage grant, purges on an
// explicit denial, no-ops while consent is still unknown). Tags and CAPI
// dispatches later in the page's life (phone click after navigating away
// from the quote page) read this DOM element.
restoreUserDataFromStorage();
// CookieYes announces banner decisions with a DOM CustomEvent — re-run the
// restore then, so a grant made ON this page hydrates without a reload,
// and a revocation purges the at-rest copy immediately.
document.addEventListener('cookieyes_consent_update', () => {
  restoreUserDataFromStorage();
});
// The 60-min upgrade-window state machine is retired (quote conversion now
// fires inline at completion) — drop any state blob it left behind.
cleanupLegacyQuoteState();
initGlobalListeners();
// Mint the Turnstile token in the background so the first conversion
// dispatch (which must attach it) doesn't pay the mint round-trip while
// a navigation races it.
prewarmTurnstileToken();

// Expose setUserDataOnDOM as a window global so legacy `<script is:inline>`
// blocks (which cannot do ES-module imports) can stash PII on the hidden
// DOM element. Bundled scripts should import setUserDataOnDOM directly
// from '@/lib/tracking' instead.
declare global {
  interface Window {
    PR_setUserDataOnDOM?: typeof setUserDataOnDOM;
    /**
     * Fire a signed CRM lead from a legacy `is:inline` form script. The
     * secret stays server-side; this only POSTs to `/api/leads/*`. Call
     * fire-and-forget — never block the form's success UX on it.
     */
    PR_pushLead?: typeof pushLeadToCRM;
    /** Affiliate `?ref=` code for this session (sessionStorage/cookie). */
    PR_getAffiliateCode?: typeof readAffiliateCode;
    /** Captured attribution params for the CRM `attribution` object. */
    PR_getAttribution?: typeof buildAttribution;
    /**
     * Fire a server-side conversion to the Soborbo event-gateway Worker from
     * a legacy `is:inline` form script (which can't ES-import). PII is read
     * from the hidden DOM side-channel (`PR_setUserDataOnDOM`), so set that
     * BEFORE calling this. Fire-and-forget; shares `eventId` with the
     * dataLayer push for Meta browser+server dedup.
     */
    PR_trackWorkerConversion?: typeof dispatchWorkerConversion;
  }
}
window.PR_setUserDataOnDOM = setUserDataOnDOM;
window.PR_pushLead = pushLeadToCRM;
window.PR_getAffiliateCode = readAffiliateCode;
window.PR_getAttribution = buildAttribution;
window.PR_trackWorkerConversion = dispatchWorkerConversion;
