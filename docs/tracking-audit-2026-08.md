# Tracking & Attribution Audit — 2026-08

**Window:** 2026-06-29 → 2026-07-31 (Google Ads restart)
**Author:** Claude (agent), brief from Laszlo / Soborbo
**Repos touched:** `Soborbo/painlessremovals` (branch `fix/tracking-p0-audit`),
`Serverside` gateway (branch `fix/ga4-source-param`)

---

## Phase 0 — Baseline (reproduced independently)

Pulled live on 2026-08-01 via the Google Ads API (GAQL) and the GA4 Data API,
property `413271735`, account `4886655031`:

| Metric | Brief | Measured | Verdict |
|---|---|---|---|
| Google Ads clicks (Restarter Packing Search, 23977510983) | 163 | **163** | match |
| Google Ads cost | ~£587 | **£587.24** | match |
| Google Ads conversions | 29 | **29** (value £33,512) | match |
| GA4 Paid Search sessions | 84 | **84** | match |
| GA4 total key events | ~200 | **200** | match |

Baseline is sound; everything below was measured against the same window.

---

## P0-A — Session source pollution: **CONFIRMED**, root cause found

### Reproduction (GA4 `sessionSourceMedium`)

| sessionSourceMedium | Sessions | Key events |
|---|---|---|
| `standalone / (not set)` | 24 | 3 |
| `server / (not set)` | 21 | 2 |
| `(not set)` | 10 | **79** |
| `after_calculator / (not set)` | 6 | 1 |
| `email_click / (not set)` | 3 | 0 |
| `e2e-test / (not set)` | 1 | 1 |

One extra polluted value the brief missed: `email_click` (from the quote-email
callback link flow).

### Root cause

An event parameter literally named **`source` is a GA4-reserved
manual-campaign key**. When a hit carrying it opens a session (or arrives
unstitched), GA4 promotes the value to the **session source**. The site sends
its internal reporting label under exactly that name, on two independent legs:

1. **Browser leg:** `global-listeners.ts` / callback flows push
   `source: 'standalone' | 'after_calculator' | 'email_click'` into the
   dataLayer; five GTM GA4 event tags (`phone_conversion`,
   `email_conversion`, `whatsapp_conversion`, `callback_conversion`,
   `instant_quote_cta_click`) forward it verbatim as event param `source`
   via `{{DLV - source}}`.
2. **Server leg (gateway):** `Serverside/src/lib/ga4.ts:68` —
   `if (payload.source) params.source = payload.source;` — sends the
   envelope label (`'server'`, `'clearance-calculator'`, …) as a GA4 MP
   event param. Compounding it, a missing `client_id` fell back to a
   **random** client_id (`generateFallbackClientId`), minting a brand-new
   GA4 user + session per hit — those are the phantom sessions.

The `(not set)` row (10 sessions / 79 key events = 40% of all key events) is
the same mechanism without a label: unstitched GA4 MP hits (mostly the
`quote_calculator_complete` server mirror and abandonment beacons where the
`_ga`/`_ga_*` cookies were absent) opening phantom sessions with no source.

### `e2e-test` traffic

One session (page_view + session_start + phone_conversion, 1 key event). The
string `e2e-test` appears **nowhere** in `painlessremovals`, `Serverside`, or
`Painless-CRM` sources — it did not come from this codebase's test harness.
Shape (real browser events + a tel: click with `source: 'e2e-test'`) indicates
an ad-hoc browser-automation run against production with an injected label.
Origin **unidentified**; mitigation is property-level (below), not code-level.

### Fixes implemented

- **Site (`fix/tracking-p0-audit`):** `buildSafePush` in
  `src/lib/tracking/tracking.ts` now remaps GA4-reserved keys at the
  chokepoint (`source`→`cta_context`, `medium`→`cta_medium`,
  `campaign`→`cta_campaign`) with a dev warning — the same pattern as the
  PII strip. No call site can leak a reserved key again.
  `save-quote.ts` GA4 MP mirror param `source: 'server'` →
  `dispatch_channel: 'server'`.
- **Gateway (`fix/ga4-source-param`):** `params.source` →
  `params.cta_context`; **no client_id → GA4 leg skipped** (structured
  warn-log) instead of minting a random phantom user. Fallback generator
  deleted. Affects all gateway tenants — flagged for review before deploy.

### Requires approval (not applied)

- **GTM:** repoint the five GA4 event tags' `source` param to a new
  `{{DLV - cta_context}}` variable, renaming the param to `cta_context`.
  Until published, those tags simply send no label (the dataLayer key no
  longer exists) — pollution stops the moment the site deploys, the label
  returns when GTM is published.
- **GA4 Admin:** define an internal/developer-traffic filter (e.g.
  `traffic_type` param or IP rule) and route all synthetic/e2e traffic to
  a test property or Debug stream. This is the only durable answer to
  `e2e-test`-style pollution.

### Definition of done — status

- No non-traffic value in `sessionSourceMedium`: **code fixed, awaits
  deploy + GTM publish; must be re-verified in live data after 24–48h.**
- Server hits inherit session: gateway now refuses unstitchable hits
  rather than fabricating sessions. Hits WITH cookies were already
  stitched (`ga4SessionIdFromRequest`).
- Test-traffic exclusion: **proposed, not yet demonstrated** (needs GA4
  Admin access + a controlled test run).

---

## P0-B — `quote_calculator_complete` fires ~2× per session: **CONFIRMED**

### Reproduction

178 events / 178 key events in the window across 54 sessions containing it;
80 of those events sat in 4 phantom "Unassigned" sessions.

### Root causes (two, stacked)

1. **Client re-fire on remount.** `/instantquote/your-quote` (ResultPage)
   re-POSTs `save-quote` on every mount; the KV dedup replays a cached 200;
   `firePostSaveTracking` then re-fired `trackEvent('quote_calculator_complete')`
   **unguarded**. The conversion (`fireQuoteConversion`) had an
   idempotence guard; the engagement event did not. Same `event_id`, but
   GA4 does not dedup on event_id → every refresh/back-nav = +1 event.
2. **Server mirror under the same name.** `save-quote.ts` mirrors the
   completion to GA4 MP as `quote_calculator_complete`. Stitched → +1 in
   the same session; unstitched → +1 in a phantom `(not set)` session.
   The old hypothesis in `docs/tracking.md` ("dedup on event_id in
   explorations") does not help standard reports or key-event counts.

The brief's other hypotheses — GTM double-tagging, island re-mount without
navigation, thank-you-page double fire — **not confirmed**; `Step12Quote` is
unreachable in the current flow (`[step].astro` redirects step-12 to
`/your-quote`), though its code path got the same guard for safety.

### Fixes implemented (site branch)

- New `fireQuoteCompletedEvent()` in `conversion-state.ts` — idempotent per
  `event_id` (own localStorage guard key, same pattern as the conversion).
  Both `ResultPage` and `Step12Quote` now use it.
- Server mirror renamed to **`quote_calculator_complete_server`** — the
  backstop stays visible in GA4 without corrupting the primary metric or
  the key-event count. `CLAUDE.md` + `docs/tracking.md` updated.

### Verification

- Unit: 255/256 site tests green, incl. new idempotence + separate-guard
  tests (`conversion-state.test.ts`), reserved-key remap tests
  (`tracking-dom.test.ts`).
- **End-to-end (browser → gateway → GA4 → Ads) NOT yet run** — requires
  deploy. Verification plan: one controlled submission, then F5 ×3 on
  /your-quote; expect exactly one `quote_calculator_complete` in GA4
  DebugView and one `quote_calculator_complete_server`.

---

## P0-C — Wrong event is the key event: **CONFIRMED** (GA4 side only)

### Event taxonomy (from source)

| Event | Fired by | Meaning | Conversion? |
|---|---|---|---|
| `instant_quote_cta_click` | client, global listener | click on any /instantquote link | no |
| `quote_calculator_first_view` | client, once per browser | first completion (Meta ViewContent marker) | no |
| `form_start` | client | calculator/form flow started | no |
| `form_step_complete` | client | calculator step completed | no |
| `attribution_selected` / `attribution_skipped` | client | "how did you hear about us" answered / skipped | no |
| `quote_calculator_complete` | client, once per completed quote (guarded, after fix) | quote saved — engagement | no (funnel) |
| `quote_calculator_complete_server` | server GA4 MP (save-quote) | backstop mirror of the above | no |
| `quote_calculator_conversion` | client `fireQuoteConversion`, idempotent per event_id | **submitted, contactable lead** (name+email+phone collected before save) | **yes** |
| `callback_conversion` | client, calculator callback request | contactable lead (callback) | **yes** |
| `contact_form_conversion` | server, after Turnstile+Resend | contact form lead | **yes** |
| `clearance_callback_conversion` | server, after Turnstile+Resend | clearance callback lead | **yes** |
| `phone_conversion` / `email_conversion` / `whatsapp_conversion` | client, global listeners | contact-intent click | yes (contact) |
| `form_abandonment` | beacon → server GA4 MP | best-effort abandonment, directional only | no |
| `form_submission` | client | jobs/affiliate/partner analytics | no |

### Findings

- GA4 key events today: `quote_calculator_complete` (inflated 178), phone,
  email, whatsapp, callback. **`quote_calculator_conversion` (49 events,
  1/session, the real lead) and `contact_form_conversion` are NOT key
  events.** Confirmed via Data API keyEvents metric.
- **Google Ads is NOT affected by this mismatch:** "Quote calculator
  finished" (7607796871) is a browser `awct` tag firing on
  `quote_calculator_conversion` (GTM trigger 107) — the correct,
  idempotent event. The 19/29 conversions stand on the right trigger.

### Proposal (for Laszlo — GA4 Admin changes, not applied)

| Event | Key event? |
|---|---|
| `quote_calculator_conversion` | **mark** |
| `contact_form_conversion`, `clearance_callback_conversion` | **mark** |
| `callback_conversion`, `phone/email/whatsapp_conversion` | keep |
| `quote_calculator_complete` (+`_server`) | **unmark** |

Ads primary/secondary (per CLAUDE.md #3 the calculator+callback double-count
is known): keep **Quote calculator finished** and **Contact form submit**
Primary; move **Callback requested** to Secondary (a post-quote callback is
the same lead). Phone/email/WhatsApp click actions stay Secondary
(intent, not a lead).

### Conversion value

Confirmed: the value sent is the calculator's **estimated quote**
(£24,490 on 19 conversions → the "57× ROAS" is a proxy artifact, not
revenue). Recommendation: **keep** sending the estimate (it is a genuine
lead-quality rank signal and Meta/Ads value-based bidding can use relative
values), but (a) do not quote ROAS from it anywhere, (b) start the
`Revenue confirmed (server)` (7665215416) upload from CRM `final_value` on
won jobs, and (c) only switch bidding to value-based once real revenue
flows. If the estimate misleads reporting before then, zeroing it is the
safe fallback — Laszlo's call.

---

## P0-D — CRM receives zero live leads: **NOT CONFIRMED as stated / STALE**

The Painless D1 tenant (`painless-crm`, 87cc2658…) contains **54 live leads**
(`deleted_at IS NULL`), first `2026-07-15`, last `2026-07-29`, continuous
daily flow since. 53/54 have `lead_attribution` rows; **15 carry a `gclid`**;
UTMs are sparse (1). The webhook path
(`save-quote.ts → sendToCRM → Painless-CRM`) is wired and delivering —
the brief's evidence predates the 2026-07-15 go-live of that path.

**What remains true / gaps:**
- The first half of the Ads window (06-29 → 07-14) produced **zero** CRM
  leads — those 14 days of spend can never be joined to outcomes.
- `lead_attribution` has **no `client_id` column** (fbp/fbc exist, GA4
  client_id does not) — the brief's DoD wants it; needs a CRM-side
  migration + site payload extension. Not done in this pass (cross-repo
  schema change, needs CRM owner review).
- No leads on 07-30/07-31 — consistent with normal daily variance
  (2-7/day), but worth a glance if it extends.

---

## P1-A — 163 clicks → 84 paid sessions (48% gap): **partially explained, re-measure gated on P0-A**

Accounting for the window:
- 84 sessions `google / cpc` (all with campaign set).
- 65 sessions under polluted sources (`standalone`, `server`, `(not set)`,
  `after_calculator`, `email_click`, `e2e-test`) — an unknown fraction of
  these were genuinely paid sessions whose source was overwritten
  (P0-A mechanism: the poison param arrived early in a real session).
- 65 "Unassigned" sessions — includes MP-phantom sessions.

Ranked residual hypotheses after P0-A deploys (per brief order):
1. Consent Mode: GA4 blocked pre-consent; UK visitors declining consent
   never create a session (no `_ga` cookie) but still click ads. Likely the
   largest honest component; measurable as (clicks − sessions) after P0-A.
2. Redirect/param-stripping: not investigated this pass.
3. Safari ITP / Turnstile: the Turnstile-blocking-conversions class was
   already fixed (2026-07-13, see `worker-tracking.ts` header); no current
   evidence it affects session counting.

**Not closed. Re-measure 7 days after the P0-A deploy** — comparing
`clicks vs (google/cpc sessions)` in a clean week is the only defensible
number. A hand-wave quantification now would be built on polluted data.

---

## P1-B — Numbered-heading queries: **NOT CONFIRMED — brief corrected**

GSC reproduces the queries (`19. house removals bristol`,
`47. professional removalists`, … 10 rows, 0 clicks, positions 29–98,
landing on `/`, `/home-packing-service/`, `/packing-guide/*`, `/faq/`).

But the hypothesis is wrong: **GSC "queries" are real user searches — page
content cannot become a query.** The numbered strings appear nowhere in the
site source, docs, or build. The signature (verbatim numbered list items
searched as-is, zero clicks, mid-tail positions, plus the US-geography
queries like `… pinecrest` / `… santa paula`) is an **external automated
rank-checker** running a numbered keyword list through US proxies.
Checked and excluded: Ubersuggest project keywords (clean), Geogrid
keywords (clean), repo content (absent).

**No site change needed; no thin-content signal in this evidence** (the
impressions land on core pages, not programmatic templates). Action: if the
tool is one of ours, fix its keyword list; otherwise ignore — impressions
like these dilute CTR stats trivially but carry no ranking penalty.

---

## Changes shipped

| Repo / branch | Change | Tests |
|---|---|---|
| `painlessremovals` / `fix/tracking-p0-audit` | reserved-key remap in `trackEvent` (P0-A); `dispatch_channel` + mirror rename in `save-quote.ts` (P0-A/B); `fireQuoteCompletedEvent` guard (P0-B); docs updated | 255 passed, tsc clean |
| `Serverside` / `fix/ga4-source-param` | `params.source`→`cta_context`; skip GA4 leg without client_id; fallback generator removed | 549 passed |

**Deploy order matters:** gateway first (stops server-leg pollution for all
tenants), then site, then GTM publish (restores the label under
`cta_context`), then GA4 key-event switch. Ads account: no changes made
(read-only, per rules).

---

## What is still NOT validated

Stated plainly, per the brief:

1. **No fix has been verified against live GA4/Ads data.** Everything above
   is code-level + unit-tested only. GA4's 24–48h latency means the
   earliest honest re-check of P0-A/P0-B is 2–3 days after deploy.
2. **The GTM change is a proposal** — until published, conversion labels
   (`after_calculator` vs `standalone`) silently disappear from GA4 events.
   Data loss is cosmetic (a label), but it is loss.
3. **The gateway no-client_id skip changes behavior for every tenant**, not
   just Painless. The reasoning (random-client hits are attribution-dead
   and reporting-toxic) is sound, but other sites' dashboards may show
   lower MP event counts after deploy. Review before merging.
4. **The e2e-test origin was not identified.** The exclusion (GA4 internal
   traffic filter / separate test property) is proposed, not demonstrated.
5. **P1-A is not closed** — by design; measuring the gap before P0-A is
   live would quantify a moving target.
6. **CRM `client_id` column** (P0-D DoD item) not implemented — cross-repo
   schema change flagged for the CRM owner.
7. The controlled end-to-end test submission (browser → gateway → GA4 →
   Ads → CRM D1) prescribed by P0-B's DoD **has not been run**; the
   step-by-step plan is in the P0-B section.
