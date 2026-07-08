# CLAUDE.md

Project: Painless Removals — main website + instant quote calculator
(Astro 6 + React 19 on Cloudflare Workers).

The calculator pages live under `/instantquote/`; everything else is the
public marketing site.

## Tracking system rules (DO NOT VIOLATE)

These constraints exist because the tracking system has measurable revenue
impact and is hard to verify after the fact (data appears with 24-48h delay
in Google Ads / GA4). Read `docs/tracking.md` for the full rationale.

1. **PII never goes into `dataLayer`.** Email, phone, names, addresses are
   stored on a hidden DOM element via `setUserDataOnDOM()` and read by GTM
   variables directly. `trackEvent()` silently strips the full `PII_KEYS`
   set (`user_data`, `user_email`, `user_phone`, `email`, `phone`,
   `phone_number`, `first_name`, `last_name`, `name`, `street`, `city`,
   `postal_code`, `postcode`, plus Meta Advanced Matching short-codes
   `em`/`ph`/`fn`/`ln`) and warns in dev. The guard is name-based, not
   value-based — putting a PII string under a non-PII key won't be caught,
   so pick the right field name. Add new PII-shaped fields to `PII_KEYS`
   in `tracking.ts`.

2. **Every `trackEvent` call ends up with an `event_id`.** Either pass one
   in (preferred — when the same event has a server-side mirror that needs
   to dedup) or let `trackEvent` generate one. The same `event_id` is what
   Meta uses to deduplicate Browser + CAPI for the same conversion.

3. **Quote conversion fires once, immediately at completion.** Call
   `fireQuoteConversion()` (from `conversion-state.ts`) right after
   save-quote succeeds, with the SAME `event_id` that went to save-quote —
   it's idempotent per event_id (refresh/retry can't double-fire). Don't
   push `quote_calculator_conversion` to the dataLayer directly.
   Phone/email/whatsapp/callback are their OWN conversion events with
   fresh event_ids; `source: after_calculator` is a reporting label only
   (`wasQuoteCompletedRecently()`), it gates nothing. The old 60-min
   "upgrade window" state machine is retired — it almost never fired
   (users close the tab; no client timer survives that), which is why Ads
   saw ~0 quote conversions. Consequence: a lead who completes the
   calculator AND requests a callback now counts in BOTH actions — keep
   only one of them Primary in Google Ads.

3b. **Conversion pushes followed by navigation MUST use
   `trackEventBeforeNavigate()`** (GTM `eventCallback` + safety timeout).
   A synchronous `window.location.href = ...` after `trackEvent()`
   cancels the Ads/GA4/Meta pixel requests mid-flight — this silently
   zeroed "Callback requested" in Ads for months.

4. **Server-side legs are split: Meta CAPI goes through the Soborbo
   event-gateway Worker; GA4 MP backstops fire in-app.** Don't add
   server-side fires from random places. The client dispatches
   conversions to `/api/event/conversion` (a Cloudflare zone route to
   the `event-gateway` Worker, NOT an app route) via
   `worker-dispatch.ts` → the Worker sends Meta CAPI. In-app GA4 MP
   backstops: `save-quote.ts` mirrors `quote_calculator_complete`;
   `/api/contact` fires `contact_form_conversion`;
   `/api/clearance-callback` fires `clearance_callback_conversion`;
   `/api/track/abandonment` forwards the abandonment beacon. Always
   background GA4 MP sends with `getWaitUntil(context.locals)` — a bare
   `void promise` can be cancelled when the Worker response flushes.
   Every GA4 MP send MUST be session-stitched: pass `sessionId`
   (`ga4SessionIdFromRequest`) and `pageLocation`
   (`pageLocationFromRequest`) to `sendGA4MP` — a hit without
   `session_id` lands as Unassigned / "(not set)" in GA4 and never
   matches a gclid, so Ads sees 0 conversions for real leads.

4b. **Every page that can fire a Worker dispatch needs the invisible
   Turnstile.** `sendToWorker` requires a Turnstile token; without the
   `challenges.cloudflare.com/turnstile` script + the
   `#cf-turnstile-invisible` container on the page, `worker-dispatch.ts`
   waits 10 s and silently DROPS the Meta CAPI leg. `Layout.astro`,
   `layout-calculator.astro` and `thank-you-callback.astro` include it —
   a new layout/standalone page with tel: links or conversion dispatches
   must too. It is invisible: no user-facing challenge, no UX impact.

5. **Consent default MUST be the first script in `<head>`, before GTM.**
   `GTMHead.astro` already enforces this. Don't reorder.

6. **`form_abandonment` is best-effort.** `pagehide` and `visibilitychange`
   don't fire reliably on mobile. We use `navigator.sendBeacon()` to
   `/api/track/abandonment` and forward to GA4 MP server-side. Treat the
   numbers as directional, not exact.

7. **Phone numbers normalize to E.164 before egress.** `normalizePhoneE164`
   defaults to GB. Don't push raw user-typed phone strings to the
   event-gateway Worker.

8. **Hashing for Meta CAPI happens in the event-gateway Worker, not in
   this repo.** `setUserDataOnDOM` stores raw values (UPD for Google Ads
   needs them raw — Google hashes inside the tag). `worker-dispatch.ts`
   sends raw normalized values to the gateway, which SHA-256-hashes them
   before Meta. The old in-app `sendMetaCapi` was removed at cutover.

## Conversion model

Conversions fire to Google Ads + Meta. NOT every form is a conversion:

| Event | Conversion? | Trigger |
|---|---|---|
| `contact_form_conversion` | yes | Server-side after Turnstile + Resend success in `/api/contact` |
| `clearance_callback_conversion` | yes | Server-side after Turnstile + Resend success in `/api/clearance-callback` |
| `phone_conversion` | yes | Client-side `tel:` click in `lib/tracking/global-listeners.ts` |
| `email_conversion` | yes | Client-side `mailto:` click |
| `whatsapp_conversion` | yes | Client-side WhatsApp click |
| `quote_calculator_conversion` | yes | Client-side `fireQuoteConversion()` immediately after save-quote succeeds (idempotent per event_id) |
| `callback_conversion` | yes | Client-side after a calculator callback request — Meta `Lead` event, its own conversion with a fresh event_id (navigation goes through `trackEventBeforeNavigate`) |
| `form_submission` (jobs/affiliate/partner_register/clearance_callback) | no | Client-side analytics only (clearance_callback also fires the conversion above; the analytics one is for funnel reporting) |
| `instant_quote_cta_click` | no | Analytics only |

## Stack notes

- Astro 6 (`output: 'static'`) + `@astrojs/cloudflare` adapter + React 19.
- **All routes are statically prerendered by default**; SSR routes opt out
  with `export const prerender = false;` (calculator pages, API routes,
  middleware-bound pages).
- **No View Transitions.** Each calculator step is a hard page-load
  (`/instantquote/[step].astro`). Don't use `astro:page-load` /
  `astro:before-swap` — they don't fire on those pages.
- Runtime env: `import { env } from 'cloudflare:workers'`. Types live in
  `src/env.d.ts` under `Cloudflare.Env`.
- KV namespaces available: `SESSION` (Astro built-in, unused but bound)
  and `RATE_LIMITER` (rate limiting + save-quote dedup). The previous
  `SESSIONS` binding was removed — calculator quote state lives in the
  client's `sessionStorage`, not server-side KV.
- Logger: `@/lib/utils/logger` — use `logger.info/warn/error/debug` not
  `console.*` for server-side code.
- Hashing primitives: `@noble/hashes` (already a dependency).
- Deploy: `wrangler deploy` after `astro build`. The adapter writes
  `dist/server/wrangler.json` which `wrangler` consumes; the root
  `wrangler.toml` is the source.

## Branch policy

Major feature work happens on a topic branch. The calculator-merge work
is on `feat/merge-calculator`.
