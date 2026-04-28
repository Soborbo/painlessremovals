# Phase 5 — Staging smoke test

Run after deploying the merge branch to a Cloudflare Workers preview
URL (`*.workers.dev`) — **before** custom-domain cutover.

## Prerequisites

- [ ] `wrangler kv namespace create "SESSION"` — paste the ID into
      `wrangler.toml` SESSION binding.
- [ ] `wrangler kv namespace create "RATE_LIMITER"` — paste ID.
- [ ] `wrangler kv namespace create "SESSIONS"` — paste ID.
- [ ] `wrangler secret put RESEND_API_KEY`
- [ ] `wrangler secret put TURNSTILE_SECRET_KEY`
- [ ] `wrangler secret put GA4_API_SECRET`
- [ ] `wrangler secret put META_CAPI_ACCESS_TOKEN`
- [ ] `wrangler secret put GOOGLE_MAPS_API_KEY`
- [ ] `wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY`
- [ ] `wrangler secret put HEALTH_CHECK_TOKEN`
- [ ] `wrangler secret put IP_HASH_SALT`
- [ ] `wrangler secret put IMVE_API_KEY` (if used)
- [ ] Fill in all `PLACEHOLDER_*` values in `wrangler.toml` `[vars]`
      block from the existing painlessv3 project's environment.

## Deploy

```bash
npm run deploy
```

The output prints a default Worker URL like:
`https://painlessremovals-worker.<account>.workers.dev`

## Static-page smoke test (5 representative pages)

- [ ] `/` — homepage loads, hero image, USP bar, navigation work.
- [ ] `/about/` — about page; click `/about/jay-newton/` from there.
- [ ] `/pricing/` — pricing page; FAQ accordion works.
- [ ] `/removals-bristol-to-london/` — long-distance route page.
- [ ] `/contact/` — contact form renders with Turnstile widget.

## Calculator flow

- [ ] `/instantquote/` → 302 → `/instantquote/step-01/`.
- [ ] `/instantquote/step-01/` — service-type buttons render.
- [ ] Walk through all 12 steps with fake data:
  - Service: home removals
  - Property size: 2-bed
  - Belongings: average
  - Postcodes: BS1 4DJ → SW1A 1AA
  - Date: any flexible
  - Address autocomplete works (Google Maps API key check)
  - Complete to `/instantquote/your-quote/`
- [ ] Confirmation email received at the test address.
- [ ] Admin notification email received at hello@painlessremovals.com.

## Form smoke tests

For each form, fill with valid data, complete Turnstile, submit:

- [ ] `/contact/` → success redirect to `/contact/thank-you/`,
      email arrives, dataLayer shows BOTH `form_submission` and
      `contact_form_conversion` with the same `event_id`.
- [ ] `/jobs/` → success redirect to `/jobs/thank-you/`, email arrives,
      dataLayer shows `form_submission` only (no conversion).
- [ ] `/affiliate-form/` → success message shown inline, two emails sent
      (admin + client intro), dataLayer shows `form_submission`.
- [ ] `/partners/` → registration form submits, redirect to
      `/partners/thank-you/`, dataLayer shows `form_submission`.
- [ ] `/house-and-waste-clearance/` → use the calculator, request
      callback, dataLayer shows `form_submission`.

## Tracking validation in DevTools

Open the deployed URL with DevTools open, **before** any interaction:

- [ ] `window.dataLayer[0]` is the `consent`/`default` push (Consent
      Mode v2 default).
- [ ] Network tab: `gtm.js?id=GTM-PXTH5JJK` loaded.
- [ ] `window.PR_setUserDataOnDOM` is a function (boot.ts ran).

Click a `tel:` link:
- [ ] `phone_conversion` event in dataLayer with `event_id`.
- [ ] Network: POST to `/api/meta/capi` (browser-side mirror).

Click a `mailto:` link:
- [ ] `email_conversion` event.

Click any "/instantquote/" CTA button:
- [ ] `instant_quote_cta_click` event with `source_page`.

Visit with `?utm_source=test&utm_medium=cpc`:
- [ ] `sessionStorage.getItem('pr_tracking')` is JSON with utm_source.

Submit the contact form successfully:
- [ ] DevTools dataLayer: `form_submission` and `contact_form_conversion`
      events both fire with same `event_id`.
- [ ] `<input id="pr_user_data">` (or whatever USER_DATA_ELEMENT_ID is)
      has data-attributes for email/phone (PII NOT in dataLayer).
- [ ] Server-side: Meta Events Manager (Test Events) shows the event
      within seconds.
- [ ] Server-side: GA4 DebugView shows the event.

## Performance

- [ ] Lighthouse on `/` (homepage): Performance ≥ 90, SEO = 100,
      Best Practices ≥ 95. (Cold cache; in dev it can be lower.)
- [ ] Lighthouse on `/instantquote/step-01/`: Performance ≥ 80
      (SSR page, lower target than static).
- [ ] Network tab: NO requests to `calc.painlessremovals.com`
      (asset prefix removed).

## Error tracking

- [ ] In a calculator step, manually run in console:
      `throw new Error('staging test')`.
- [ ] Within ~30 seconds, the configured Google Sheet
      (`ERROR_SHEETS_ID`) gets a new row.

## Acceptance

- All checklist items pass.
- 24 hours after deploy, `wrangler tail` shows < 1% 5xx rate.
- No support tickets (still on preview URL only — no public traffic
  yet, but you can share the preview link with stakeholders).
