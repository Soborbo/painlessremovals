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
| Server analytics | GA4 Measurement Protocol | Backstop for server-known events (quote saved, abandonment) |
| Server social | Meta Conversions API | Browser+server dedup on shared `event_id` |

## Source layout

```
src/lib/tracking/
  config.ts              # constants (timing windows, storage keys, endpoints)
  uuid.ts                # UUID v4 with HTTPS-less fallback
  tracking.ts            # trackEvent + setUserDataOnDOM (PII side-channel)
  conversion-state.ts    # 60-min upgrade window state machine, localStorage-backed
  form-tracking.ts       # form_start / form_step_complete / form_abandonment
  global-listeners.ts    # tel: / mailto: / wa.me click handlers, scroll depth
  meta-mirror.ts         # client → /api/meta/capi mirror for browser+server dedup
  boot.ts                # imported once per page-load to wire everything up
  server.ts              # GA4 MP + Meta CAPI server-side senders (Cloudflare Worker)
  index.ts               # public barrel — components import from `@/lib/tracking`

src/pages/api/
  track/abandonment.ts   # sendBeacon target → forwards to GA4 MP
  meta/capi.ts           # client mirror ingress → forwards to Meta CAPI
  save-quote.ts          # ALSO mirrors quote_calculator_complete to GA4 MP

src/components/
  GTMHead.astro          # consent default + CookieYes + GTM bootstrap
  GTMBody.astro          # noscript fallback iframe

GTM-PXTH5JJK_workspace_v2.json   # generated container JSON (import in GTM UI)
scripts/build-gtm-container.mjs  # source of truth for the GTM JSON
```

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
| `quote_calculator_conversion`    | upgrade window elapses without upgrade (LATE conversion) | `value`, `currency`, `service`, `late_conversion: true` if past timer |
| `callback_conversion`            | callback form submitted | `value`, `currency`, `service`, `source` |
| `contact_form_submit`            | reserved (no contact form yet on this site) | — |
| `phone_conversion`               | tel: click OR programmatic phone dial after quote | `value`, `currency`, `service`, `source`, `tel_target` |
| `email_conversion`               | mailto: click | `source` |
| `whatsapp_conversion`            | click on `wa.me` / `whatsapp.com` link | `source` |
| `attribution_selected`           | user picks a source on the loading-screen card | `attribution_source` |
| `attribution_skipped`            | loading-screen completes without selection | — |
| `scroll_50`, `scroll_90`         | scroll depth thresholds, once per page-load | — |

PII is NEVER pushed to dataLayer. See "PII handling" below.

## The 60-minute upgrade window

The core insight: a kalkulátor completion ≠ a real lead until the user
takes a higher-intent action. We don't fire
`quote_calculator_conversion` immediately. Instead, on completion we
record state in `localStorage` (`pl_quote_state`) and start a timer.

- If the user clicks `tel:`, `mailto:`, `wa.me`, or submits the
  callback form within 60 minutes → that action becomes the conversion
  with the same `event_id`. The quote is marked `upgraded` and the
  timer is cancelled. Google Ads and Meta dedup against `event_id` so
  it counts as one conversion, not two.
- If the timer elapses without an upgrade → `quote_calculator_conversion`
  fires automatically. If the user closed the tab and re-opened the
  site within 24 hours of the timeout, it fires on the next page-load
  with `late_conversion: true`.

Cross-tab: a `BroadcastChannel('pl_quote_state_v1')` notifies other
tabs when an upgrade happens, so they cancel their pending timers too.
If `BroadcastChannel` isn't available, multiple tabs may both fire the
late conversion — Meta's `event_id` dedup catches it for Pixel/CAPI;
Google Ads does NOT dedup on `orderId` for Search/Display by default,
so this is a known minor over-count edge case. Acceptable for our
volume.

**Why this model**: `phone_conversion` is the highest-quality signal
for Google Ads Smart Bidding — a phone click after seeing the price
correlates strongly with bookings. By rolling the kalkulátor completion
into the phone conversion we feed Smart Bidding fewer, better signals.
For users who never upgrade, the late-fire conversion still counts
(important for not losing leads in attribution).

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

| Event | Server fires | Why |
| --- | --- | --- |
| `quote_calculator_complete` | GA4 MP from `save-quote.ts` | Engagement backstop. Browser dataLayer push can miss (adblock, tab close after submit). |
| `form_abandonment` | GA4 MP from `/api/track/abandonment` (sendBeacon) | Pagehide-time browser pushes don't reliably reach GTM on mobile. |
| `quote_calculator_conversion`, `callback_conversion`, `phone_conversion`, `email_conversion`, `whatsapp_conversion`, `quote_calculator_first_view` | Meta CAPI from `/api/meta/capi` | Browser Pixel quality is degraded by iOS/ATT and adblockers. CAPI gives the server-side signal Meta uses to model attribution. |

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
wait_for_update:   500ms
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
| `META_PIXEL_ID` | Plaintext | server-side mirror | `292656820246446` — used by `sendMetaCapi()` (the browser side gets it from the GTM container, not env) |
| `META_CAPI_ACCESS_TOKEN` | **Secret** | server-side mirror | Meta Events Manager → Pixel → Settings → Conversions API → Generate access token |
| `META_CAPI_TEST_EVENT_CODE` | Plaintext | testing only | When set, all Meta CAPI hits land in the Test Events tab instead of production. **Remove before going live.** |

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
  `service`, `form_name`, `source`, `last_step`, `late_conversion`

### Meta Events Manager (Pixel `292656820246446`)
- [ ] Settings → "Automatic Advanced Matching": ON
- [ ] Settings → Conversions API → Generate access token →
  `META_CAPI_ACCESS_TOKEN`
- [ ] Test Events tab → grab the test code → set
  `META_CAPI_TEST_EVENT_CODE` during validation. **Remove it before
  production traffic** or test events will pollute live optimization.

### GTM (`GTM-PXTH5JJK`)
- [ ] Tag Manager → Admin → Import Container →
  `GTM-PXTH5JJK_workspace_v2.json`. Choose:
   - "New" workspace name: `tracking-rewrite-v2`
   - Import option: **Overwrite** (the v2 is a complete replacement)
   - The import also adds the `CookieYes CMP` custom template (carried
     over from the previous container so you don't have to re-install
     it from the Community Template Gallery).
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

1. Open Chrome DevTools → Application → Local Storage → confirm a
   `pl_quote_state` entry appears after kalkulátor completion.
2. GA4 Admin → DebugView → confirm `quote_calculator_complete`,
   `attribution_selected`, `scroll_50`/`scroll_90` events appear.

Use Google Ads Tag Assistant for the conversion tags:

1. Tag Assistant Companion → record the kalkulátor flow.
2. Confirm the `Quote Calculator Conversion` Google Ads tag fires on
   the late-conversion timer (or upgrade) with the right value and
   that "User-Provided Data: Provided" appears.

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
6. Import the new JSON into GTM (or merge selectively in the GTM UI).

To change the upgrade window:

1. Edit `QUOTE_UPGRADE_WINDOW_MS` in `src/lib/tracking/config.ts`.
2. Note: existing in-flight quote states use the old window until
   they expire (the timer is captured at `resetQuoteState` time).

To rotate the GA4 measurement ID or Pixel ID:

1. Update env vars in Cloudflare Pages.
2. Update `GA4_MEASUREMENT_ID` / `META_PIXEL_ID` in
   `scripts/build-gtm-container.mjs`.
3. Regenerate, re-import GTM JSON.

## Known limitations

- **`form_abandonment` is best-effort.** Mobile pagehide/visibilitychange
  fires inconsistently. The numbers should be treated as directional,
  not exact.
- **Cross-domain upgrade.** This codebase serves the kalkulátor at
  `calc.painlessremovals.com`. The main `painlessremovals.com` is a
  separate WordPress site. A user who completes the kalkulátor and
  then clicks a phone number on the WordPress site will NOT have
  their upgrade tracked by the 60-min window — `localStorage` is
  per-origin. Implementing cross-domain upgrade is out of scope for
  this branch (would need a 1st-party server-side state store
  keyed by something like a Cloudflare KV record).
- **CookieYes free plan: no modeled conversions** under denial.
  Conversions from users who reject ads consent are simply lost.
  Pro plan would recover most of them via Google's Consent Mode
  modeling. Decision deferred.
- **No real `contact_form_submit` event source on this site.**
  The trigger and tags exist in GTM but the kalkulátor doesn't fire
  this event today. Reserved for a future contact page.
