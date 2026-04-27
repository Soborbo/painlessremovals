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
   variables directly. `trackEvent()` strips a `user_data` key if anyone
   accidentally passes one.

2. **Every `trackEvent` call ends up with an `event_id`.** Either pass one
   in (preferred — when the same event has a server-side mirror that needs
   to dedup) or let `trackEvent` generate one. The same `event_id` is what
   Meta uses to deduplicate Browser + CAPI for the same conversion.

3. **Quote conversion fires once, on upgrade or after 60 min.** Use
   `resetQuoteState()` when the calculator finishes; let
   `markQuoteUpgraded()` consume the state when the user takes a higher-
   intent action (phone/email/whatsapp click, callback form). Don't fire
   `quote_calculator_conversion` directly — `conversion-state.ts` owns it.

4. **Server-side mirrors run from `save-quote.ts`, `/api/meta/capi`, and
   the contact form (`/api/contact`).** Don't add server-side fires from
   random places. `save-quote.ts` mirrors `quote_calculator_complete` to
   GA4 Measurement Protocol; `/api/meta/capi` is the single ingress for
   client-driven Meta CAPI mirrors; `/api/contact` fires
   `contact_form_conversion` to both GA4 MP and Meta CAPI on Turnstile +
   Resend success.

5. **Consent default MUST be the first script in `<head>`, before GTM.**
   `GTMHead.astro` already enforces this. Don't reorder.

6. **`form_abandonment` is best-effort.** `pagehide` and `visibilitychange`
   don't fire reliably on mobile. We use `navigator.sendBeacon()` to
   `/api/track/abandonment` and forward to GA4 MP server-side. Treat the
   numbers as directional, not exact.

7. **Phone numbers normalize to E.164 before hashing.** `normalizePhoneE164`
   defaults to GB. Don't push raw user-typed phone strings through Meta
   CAPI.

8. **Hashing for Meta CAPI happens server-side.** `setUserDataOnDOM` stores
   raw values (UPD for Google Ads needs them raw — Google hashes inside the
   tag). Meta CAPI requires SHA-256 of normalized values; we do that in
   `server-tracking.ts` using `@noble/hashes`.

## Conversion model

Conversions fire to Google Ads + Meta. NOT every form is a conversion:

| Event | Conversion? | Trigger |
|---|---|---|
| `contact_form_conversion` | yes | Server-side after Turnstile + Resend success in `/api/contact` |
| `phone_click_conversion` | yes | Client-side `tel:` click in `lib/tracking/global-listeners.ts` |
| `email_click_conversion` | yes | Client-side `mailto:` click |
| `whatsapp_click_conversion` | yes | Client-side WhatsApp click |
| `quote_calculator_conversion` | yes | Calculator's existing `markQuoteUpgraded()` flow |
| `form_submission` (jobs/affiliate/partner_register/clearance_callback) | no | Client-side analytics only |
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
- KV namespaces available: `SESSION` (Astro built-in, unused but bound),
  `RATE_LIMITER`, `SESSIONS` (calculator quote state).
- Logger: `@/lib/utils/logger` — use `logger.info/warn/error/debug` not
  `console.*` for server-side code.
- Hashing primitives: `@noble/hashes` (already a dependency).
- Deploy: `wrangler deploy` after `astro build`. The adapter writes
  `dist/server/wrangler.json` which `wrangler` consumes; the root
  `wrangler.toml` is the source.

## Branch policy

Major feature work happens on a topic branch. The calculator-merge work
is on `feat/merge-calculator`.
