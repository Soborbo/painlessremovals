# Tracking system

This document is the authoritative reference for the analytics + ads
tracking pipeline of `painlessremovals.com`. It covers what gets tracked,
where, why, and how to operate it. If a thing is documented here and
behaves differently in production, **the production behaviour is the
bug** — the code lives at `src/lib/tracking/` and `src/pages/api/`.

## At a glance

| Layer | Tech | Purpose |
| --- | --- | --- |
| Consent | Consent Mode v2 + CookieYes | Default-deny posture before user picks |
| Container | Google Tag Manager (`GTM-PXTH5JJK`) | Routes dataLayer events to GA4, Google Ads, Meta Pixel |
| Browser analytics | GA4 (via GTM) | Engagement + conversion events |
| Browser ads | Google Ads conversions (via GTM) | Smart Bidding signal |
| Browser social | Meta Pixel (via GTM) | Lead / Contact / ViewContent events |
| Server analytics | GA4 Measurement Protocol | Backstop for server-known events (quote saved, abandonment, contact/clearance conversions) |
| Server social | Meta Conversions API via the **Soborbo event-gateway Worker** (`/api/event/conversion` zone route) | Browser+server dedup on shared `event_id` — see `docs/tracking-worker-rebuild.md` |

## Source layout

```
src/lib/tracking/
  config.ts              # constants (timing windows, storage keys, endpoints)
  uuid.ts                # UUID v4 with HTTPS-less fallback
  tracking.ts            # trackEvent + setUserDataOnDOM (PII side-channel)
  conversion-state.ts    # fireQuoteConversion (immediate, idempotent per event_id)
  form-tracking.ts       # form_start / form_step_complete / form_abandonment
  global-listeners.ts    # tel: / mailto: / wa.me click handlers, scroll depth
  worker-dispatch.ts     # conversion dispatch → Soborbo event-gateway Worker (Meta CAPI)
  utm-capture.ts         # utm_* / gclid / fbclid capture + affiliate ref
  boot.ts                # imported once per page-load to wire everything up
  server.ts              # GA4 MP server-side sender + client_id helpers
  index.ts               # public barrel — components import from `@/lib/tracking`

src/lib/
  worker-tracking.ts     # canonical client-lib for the event-gateway Worker
                         # (Turnstile token, consent, attribution, sendToWorker)

src/pages/api/
  track/abandonment.ts   # sendBeacon target → forwards to GA4 MP
  save-quote.ts          # ALSO mirrors quote_calculator_complete to GA4 MP
  contact.ts             # fires contact_form_conversion to GA4 MP
  clearance-callback.ts  # fires clearance_callback_conversion to GA4 MP

# NOT an app route: /api/event/conversion is a Cloudflare zone route to the
# Soborbo `event-gateway` Worker (repo Soborbo/Serverside). It owns the
# server-side Meta CAPI leg. See docs/tracking-worker-rebuild.md.

src/components/
  GTMHead.astro          # consent default + CookieYes + GTM bootstrap
  GTMBody.astro          # noscript fallback iframe

GTM-PXTH5JJK_workspace_v2.json   # generated container JSON — NEVER PUBLISHED, see below
scripts/build-gtm-container.mjs  # generator for the JSON above
```

**⚠ The repo's container JSON is NOT what's live.** Verified against the
GTM API on 2026-07-08: the LIVE container GTM-PXTH5JJK runs **version 52**
("Add currencyCode to Contact form submit Ads tag", published
2026-06-29), which has 17 triggers / 35 tags and NONE of the v2 JSON's
extra triggers (`contact_form_conversion`, `form_submission`,
`instant_quote_cta_click`). The live wiring is correct for the code:
every live trigger name matches a dataLayer event the code actually
pushes (incl. `contact_form_submit` → the Ads "Contact form submit" awct
tag, Conversion Linker with URL passthrough, consent-gated Meta tags).
Do NOT import the v2 JSON over it without reconciling — and do not
audit GTM from the JSON file; query the live container.

## DataLayer event reference

Every event includes `event_id` (UUID v4 — generated automatically when
the caller doesn't pass one). `event_id` is the dedup key used by Meta
to pair browser Pixel + server CAPI hits.

| Event name                       | When | Key params |
| --- | --- | --- |
| `pricing_view`                   | not currently emitted; reserved | `page_path` |
| `form_start`                     | first focus on a tracked form's input | `form_name`, `page_path`, `page_title` |
| `form_step_complete`             | user advances past a step | `form_name`, `step_name`, `step_number`, `total_steps` |
| `form_abandonment`               | tab close / hide / navigate-away with unsubmitted form | `form_name`, `last_step`, `last_field`, `time_spent_seconds`, `exit_page_path` |
| `quote_calculator_complete`      | quote saved successfully (engagement, every completion) | `quote_id`, `value`, `currency`, `service` |
| `quote_calculator_first_view`    | first quote completion in this browser → triggers Meta `ViewContent` | `service` (NO value, intentionally) |
| `quote_calculator_conversion`    | immediately after save-quote succeeds (`fireQuoteConversion`, idempotent per event_id) | `value`, `currency`, `service` |
| `callback_conversion`            | callback form submitted (navigation via `trackEventBeforeNavigate`) | `value`, `currency`, `service`, `source` |
| `contact_form_submit`            | contact form success on /contact (fires the live Ads "Contact form submit" awct tag, GA4 event + Meta Contact) | `form_source` |
| `phone_conversion`               | tel: click OR programmatic phone dial after quote | `value`, `currency`, `service`, `source`, `tel_target` |
| `email_conversion`               | mailto: click | `source` |
| `whatsapp_conversion`            | click on `wa.me` / `whatsapp.com` link | `source` |
| `attribution_selected`           | user picks a source on the loading-screen card | `attribution_source` |
| `attribution_skipped`            | loading-screen completes without selection | — |
| `scroll_50`, `scroll_90`         | scroll depth thresholds, once per page-load | — |

PII is NEVER pushed to dataLayer. See "PII handling" below.

## Quote conversion: fires immediately at completion

`quote_calculator_conversion` fires inline on the results page right
after save-quote succeeds, via `fireQuoteConversion()` — same
`event_id` as the save-quote POST, idempotent per event_id (a
localStorage fired-guard, `pl_quote_state:fired`, blocks refresh /
retry / second-tab double-fires).

**History (why the old model was retired, 2026-07):** this used to be a
60-minute "upgrade window" state machine — the conversion fired late,
or was consumed by a higher-intent action (phone/callback) to avoid
double-counting. In practice most visitors closed the tab before the
window elapsed, and no client-side timer survives a closed browser: the
conversion almost never fired. Google Ads recorded ONE "Quote
calculator finished" conversion in 14 weeks against ~20 real weekly
completions. The upgrade model optimized for signal purity and lost the
signal entirely.

Consequences of the new model:

- Phone / email / whatsapp / callback are their OWN conversion events
  with fresh event_ids. `source: after_calculator` (from
  `wasQuoteCompletedRecently()`, 60-min horizon) is a reporting label
  only.
- A lead who completes the calculator AND then requests a callback (or
  calls) counts in BOTH conversion actions. In Google Ads keep only one
  of them **Primary** per goal (recommendation: "Quote calculator
  finished" primary as the volume signal; callback/phone secondary or
  value-bearing) — otherwise the "Conversions" column double-counts one
  human. Meta receives a `Lead` for the quote and another `Lead` for
  the callback (different event_ids) — expected, monitor Lead counts.
- Navigation after a conversion push MUST go through
  `trackEventBeforeNavigate()` (GTM `eventCallback` + safety timeout).
  A synchronous redirect after `trackEvent()` cancels the Ads/GA4/Meta
  pixel requests — this race is what zeroed "Callback requested" in Ads.

## PII handling

PII (email, phone, names, addresses) **never** enters `dataLayer` or
gets logged client-side. Flow:

1. React form-success handler calls `setUserDataOnDOM(normalizeUserData({...}))`.
2. The values land on `<div id="__pl_user_data__" hidden>` as
   `data-email`, `data-phone`, `data-firstName`, etc.
3. GTM Custom JavaScript variables read the dataset and feed the
   Google Ads "User-Provided Data" variable
   (`{{UPD - User Provided Data}}`).
4. Google Ads tags hash the values inside the GTM tag (Google's
   client-side SDK handles SHA-256). They get sent only to Google.
5. Meta's path: the React success handler also POSTs (`sendBeacon` if
   available) to `/api/meta/capi` with the raw values. The server
   normalizes (email lowercase, phone E.164, postal code uppercase &
   spaces stripped, country lower) and SHA-256-hashes them via
   `@noble/hashes` before sending to Meta CAPI.

Result: PII is in a single hidden DOM node and on two outbound HTTPS
requests (GTM→Google, ours→Meta), with hashing in the latter. Not in
`window.dataLayer`, not in the page source, not in any GTM Variable
that vendor scripts can sniff.

The browser-side Meta Pixel (loaded by GTM) gets only the `event_id`
and `value`/`currency`. CAPI carries the hashed PII. They share
`event_id` and Meta dedupes them.

## Server-side mirroring

Every GA4 MP hit is **session-stitched**: `sendGA4MP` merges `session_id`
(from the `_ga_<STREAM>` cookie via `ga4SessionIdFromRequest`),
`page_location` (from the API POST's Referer via `pageLocationFromRequest`)
and an `engagement_time_msec` floor into each event. Without these the
hit lands in GA4 as Unassigned / source "(not set)" and can never be
matched to a gclid — which surfaced as ad spend with 0 recorded
conversions while the leads actually existed. When consent is denied
there is no `_ga`/`_ga_*` cookie; those hits fall back to a
fingerprint-derived client_id with no session and stay Unassigned —
that minority is expected and acceptable.

| Event | Server fires | Why |
| --- | --- | --- |
| `quote_calculator_complete` | GA4 MP from `save-quote.ts` | Engagement backstop. Browser dataLayer push can miss (adblock, tab close after submit). NOTE: GA4 does NOT dedup browser + MP — when both arrive this event double-counts. The MP hit reuses the browser's `_ga` client_id + `_ga_*` session_id (same-origin cookies) so it lands on the same GA4 user AND session; treat raw counts as inflated and dedup on `event_id` in explorations/BigQuery. |
| `contact_form_conversion` | GA4 MP from `/api/contact` | Conversion fires only after Turnstile + Resend success — server is authoritative. |
| `clearance_callback_conversion` | GA4 MP from `/api/clearance-callback` | Same as above. |
| `form_abandonment` | GA4 MP from `/api/track/abandonment` (sendBeacon) | Pagehide-time browser pushes don't reliably reach GTM on mobile. The client pushes the dataLayer copy ONLY when the beacon fails to queue, so GA4 gets one of the two, not both. |
| `quote_calculator_conversion`, `callback_conversion`, `clearance_callback_conversion`, `phone_conversion`, `email_conversion`, `whatsapp_conversion`, `contact_form_submit` | Meta CAPI via the Soborbo event-gateway Worker (`/api/event/conversion`, dispatched by `worker-dispatch.ts`) | Browser Pixel quality is degraded by iOS/ATT and adblockers. CAPI gives the server-side signal Meta uses to model attribution. Shared `event_id` dedups browser+server. |

We do NOT mirror Google Ads conversions server-side. The client tag
already sees `gclid` cookies via Conversion Linker, which is what Ads
needs. Server-side Ads conversion uploads (offline conversion uploads
via the API) are a separate workflow — not implemented here.

## Consent

CookieYes runs the user-facing banner. It is loaded as a **GTM tag**
(`CookieYes CMP`, type `cvt_KDQSW`, fires on the built-in
"Consent Initialization - All Pages" trigger), so its config lives
inside the GTM container, not as a separate Cloudflare env var.

Consent Mode v2 defaults (declared in `GTMHead.astro` BEFORE GTM loads):

```
ad_storage:        denied
analytics_storage: denied
ad_user_data:      denied
ad_personalization: denied
functionality_storage: denied
personalization_storage: denied
security_storage:  granted
wait_for_update:   2000ms
```

Tag-level consent settings in the GTM container:

- Google tags (GA4, Conversion Linker, Google Ads) → built-in
  consent handling. They will fire with reduced data when
  `analytics_storage` / `ad_storage` is denied (cookieless ping).
- Meta Pixel + custom HTML tags → require `ad_storage = granted`.
  Will not fire under denial.

CookieYes free plan does NOT ship modeled conversions. If the
analytics layer needs reliable modeled data after consent denial, the
Pro plan ($10-25/site/month) is required. Open question for the
business.

## Environment variables

Set in Cloudflare Pages → Settings → Environment variables (Production
+ Preview). All optional individually — the system degrades gracefully
when one is missing.

| Var | Plain / Secret | Required for | Purpose |
| --- | --- | --- | --- |
| `GTM_ID` | Plaintext | client + server | `GTM-PXTH5JJK` — used by `GTMHead.astro` to render the GTM bootstrap |
| `GA4_MEASUREMENT_ID` | Plaintext | server-side mirror | `G-05GFQ1XQFH` — used by `sendGA4MP()` (the browser side gets it from the GTM container, not env) |
| `GA4_API_SECRET` | **Secret** | server-side mirror | GA4 → Admin → Data Streams → Web → Measurement Protocol API secrets |
| `PUBLIC_TURNSTILE_SITE_KEY` | Plaintext (public) | gateway dispatch | Site key for the invisible Turnstile widget; its secret pair lives on the event-gateway Worker (`TURNSTILE_SECRET_KEY`). |

Meta credentials (`META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`,
`META_CAPI_TEST_EVENT_CODE`) are **no longer read by this app** — they
live in the event-gateway Worker's `SITE_CONFIG` KV. If they're still set
on this Worker they're inert and can be removed.

The CookieYes website key is **NOT** an env var — it's configured inside
the GTM container as a tag parameter on the `CookieYes CMP` tag.

Without `GA4_API_SECRET` / `META_CAPI_ACCESS_TOKEN` the server-side
mirrors silently no-op (logged at debug level). Browser-side tracking
keeps working — server is a redundancy layer.

## Setup checklist (post-deploy)

### Cloudflare Pages
- [ ] Set the env vars above on Production AND Preview environments

### GA4 (`G-05GFQ1XQFH`)
- [ ] Admin → Events → mark as conversion: `quote_calculator_conversion`,
  `callback_conversion`, `contact_form_submit`, `phone_conversion`,
  `email_conversion`, `whatsapp_conversion`
- [ ] Admin → Data Streams → Web → Measurement Protocol API secrets →
  create `painless-server` (use this value as `GA4_API_SECRET`)
- [ ] Admin → Custom Definitions → register event-scoped params:
  `service`, `form_name`, `source`, `last_step`
  (`late_conversion` is retired — nothing emits it since the
  upgrade-window removal)

### Meta Events Manager (Pixel `292656820246446`)
- [ ] Settings → "Automatic Advanced Matching": ON
- [ ] Settings → Conversions API → Generate access token →
  `META_CAPI_ACCESS_TOKEN`
- [ ] Test Events tab → grab the test code → set
  `META_CAPI_TEST_EVENT_CODE` during validation. **Remove it before
  production traffic** or test events will pollute live optimization.

### GTM (`GTM-PXTH5JJK`)

**This import was never performed — and must NOT be performed as-is.**
The live container evolved past this checklist (v52 as of 2026-06-29,
correct trigger wiring — see the warning in "Source layout" above). The
v2 JSON no longer reflects the live state; importing it with Overwrite
would destroy live fixes (the Contact form submit awct tag's currency,
the clearance tags, Microsoft Clarity). Kept for historical reference:

- [x] ~~Tag Manager → Admin → Import Container →
  `GTM-PXTH5JJK_workspace_v2.json` (Overwrite)~~ — superseded by
  incremental edits made directly in the GTM UI (v37→v52).
- [ ] Enhanced Conversions are **already configured** by the import:
  the `Google Tag — GA4` has a `user_data` shared event setting that
  reads from the `JS - User Data Object` variable, which builds the
  Google-shape user_data object from the hidden DOM element populated
  by `setUserDataOnDOM()`. Every Google Ads conversion event picks
  this up automatically — no per-tag wiring needed.

  After import, you can verify by opening `Google Tag — GA4` and
  checking that "Configuration parameters" / "Shared event settings"
  contains the `user_data` row.
- [ ] Test in Preview mode using GTM's preview-and-debug — open the
  site in preview, complete a kalkulátor, verify each event
  appears with correct DLV / UPD / event_id values
- [ ] When happy: Submit → publish a new version with description
  "v2 tracking rewrite — see commit on `claude/review-tracking-system-mI3YN`"
- [ ] Old tags like `Phone call (gaawe)`, `Instant Quote Submitted`,
  `Call Back Requested`, `FB Lead`, `FB phone no click` are removed
  by the import — verify in the Tags list. The GA4 conversion IDs
  (`11462492788`) and 3 conversion labels are reused, so attribution
  history continues.

### Google Ads
- [ ] No changes — the existing 3 conversion actions remain valid.
  `email_conversion`, `whatsapp_conversion`, `contact_form_submit` do
  NOT have Google Ads conversion actions (only GA4 + Meta). If
  campaign performance later needs them, create the conversion
  actions in Ads, get the new labels, add to
  `scripts/build-gtm-container.mjs`, regenerate, re-import the GTM
  JSON.

## Validation

Use Meta Test Events while `META_CAPI_TEST_EVENT_CODE` is set:

1. Visit `painlessremovals.com` in a fresh browser.
2. Complete the kalkulátor.
3. Click the Book Now / phone button.
4. In Meta Events Manager → Test Events you should see:
   - `Lead` event marked **"Browser AND Server"** (the dedup
     succeeded — same `event_id` from Pixel and CAPI)
   - `Contact` event for the phone click, also "Browser AND Server"
5. If you see only "Browser" → CAPI is not firing or `event_id` is
   not being read. Check `/api/meta/capi` request logs in Cloudflare
   and confirm `META_CAPI_ACCESS_TOKEN` is set.

Use GA4 DebugView for engagement events:

1. Open Chrome DevTools → Application → Local Storage → confirm
   `pl_quote_state:fired` holds the completion's event_id after
   kalkulátor completion (the old `pl_quote_state` blob is retired).
2. GA4 Admin → DebugView → confirm `quote_calculator_complete` AND
   `quote_calculator_conversion` (both fire at completion now),
   `attribution_selected`, `scroll_50`/`scroll_90` events appear.

Use Google Ads Tag Assistant for the conversion tags:

1. Tag Assistant Companion → record the kalkulátor flow.
2. Confirm the `Quote Calculator Conversion` Google Ads tag fires
   immediately on the results page with the right value and that
   "User-Provided Data: Provided" appears.

## Maintenance

To add a new event:

1. Add the event name to the dataLayer push site (`trackEvent('your_event', { ... })`).
2. Add a custom-event trigger entry in
   `scripts/build-gtm-container.mjs` (`trigId.your_event`).
3. Add a tag entry — usually a GA4 Event tag, optionally a Meta Pixel
   tag, optionally a Google Ads conversion.
4. Update the `META_EVENT_NAMES` map in `meta-mirror.ts` if Meta
   should mirror this event.
5. Run `node scripts/build-gtm-container.mjs`.
6. Merge the change SELECTIVELY in the GTM UI (add the one new
   trigger/tag by hand, or import with "Merge → Rename conflicting").
   Never import with Overwrite — the live container (v52+) has fixes
   the generated JSON doesn't.

To change the `after_calculator` labelling horizon:

1. Edit `QUOTE_SOURCE_LABEL_WINDOW_MS` in `src/lib/tracking/config.ts`.
   (Reporting label only — no firing logic depends on it.)

To rotate the GA4 measurement ID or Pixel ID:

1. Update env vars in Cloudflare Pages.
2. Update `GA4_MEASUREMENT_ID` / `META_PIXEL_ID` in
   `scripts/build-gtm-container.mjs`.
3. Regenerate, re-import GTM JSON.

## Known limitations

- **`form_abandonment` is best-effort.** Mobile pagehide/visibilitychange
  fires inconsistently. The numbers should be treated as directional,
  not exact.
- **`quote_calculator_complete` double-counts in GA4.** Both the browser
  (GTM tag) and `save-quote.ts` (MP backstop) fire it and GA4 cannot
  dedup the pair. Accepted trade-off (losing adblocked completions is
  worse); dedup on `event_id` when exact counts matter.
- **CookieYes free plan: no modeled conversions** under denial.
  Conversions from users who reject ads consent are simply lost.
  Pro plan would recover most of them via Google's Consent Mode
  modeling. Decision deferred.
- ~~No real `contact_form_submit` event source on this site.~~
  **Outdated:** `/contact` fires `contact_form_submit` on success
  (src/pages/contact.astro) and the live GTM v52 wires it to the Ads
  "Contact form submit" awct tag, a GA4 event and Meta `Contact`.
