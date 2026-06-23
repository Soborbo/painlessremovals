# Painless Removals — Conversion-Tracking Audit

**Date:** 2026-06-23 · **Scope:** ad click → on-site capture → GA4 / Google Ads / Meta → CRM offline-conversion foundation.
**Method:** code read across all repos + live verification (published GTM container, GA4 Data API, Supabase, Playwright E2E on production).

> Legend: ✅ PASS · ❌ BREAK · ⚠️ partial / caveat.

---

## 1. Architecture map

```
                      ┌────────────────────────────────────────────┐
   Ad / organic ─────▶│  painlessremovals.com (Astro 7 on CF Worker)│
   (?gclid,?utm)      │                                            │
                      │  utm-capture.ts → sessionStorage pr_tracking│  ← gclid/utm persisted
                      │  boot.ts → global-listeners (tel/mail/wa)   │
                      │  GTMHead.astro → Consent Mode v2 (denied)   │
                      │  GTM-PXTH5JJK (CookieYes CMP)               │
                      │                                            │
                      │  Lead surfaces:                            │
                      │   • Quote calculator  /api/save-quote ─────┼──┐ signed HMAC webhook
                      │   • Callback forms    /api/callbacks ──────┼──┤ (deliver* → sendToCRM)
                      │   • Clearance callbk  /api/clearance-cb     │  │
                      │   • Contact form      /api/contact (EMAIL  │  │  ← NOT sent to CRM
                      │                        ONLY, no CRM)        │  │
                      │   • Vehicle-check / Job app  (NOT leads)    │  │
                      └────────────────────────────────────────────┘  │
                                                                       ▼
                      ┌────────────────────────────────────────────────────────┐
                      │  Painless-CRM (Next.js 16 on CF Worker, Supabase)        │
                      │  createWebhookHandler (HMAC, replay, dedup)              │
                      │   /api/webhooks/quote   → ingestQuote                    │
                      │   /api/webhooks/contact → ingestContact                  │
                      │   /api/webhooks/callback→ ingestCallback                 │
                      │   /api/webhooks/affiliate→ ingestAffiliate ─ writeAttribution
                      │                                                          │
                      │  jobs · customers · webhook_events · attributions(EMPTY) │
                      │  offline_conversion_uploads (schema only, no code)       │
                      └────────────────────────────────────────────────────────┘
```

**Repos:** `Soborbo/painlessremovals` (site + calculator, all native — no separate Next.js calc app), `Soborbo/Painless-CRM` (`painless-crm/` subdir), `tracking-kit` (the portable source the site's `src/lib/tracking/` was copied from). The site does **not** import a tracking package — tracking is vendored into `src/lib/tracking/`.

### Per-lead data flow

| Lead type | Site dataLayer event | Server conversion mirror | Reaches CRM? | Attribution carried? |
|---|---|---|---|---|
| Quote calculator complete | `quote_calculator_complete` (engagement) | GA4 MP | ✅ `/api/webhooks/quote` | ✅ gclid/utm in payload |
| Quote conversion (upgrade/60min) | `quote_calculator_conversion` | Meta CAPI | — | — |
| Callback (calculator) | `callback_conversion` | Meta CAPI | ✅ `/api/webhooks/callback` | ❌→✅ (fixed, PR #20) |
| Clearance callback | `clearance_callback_conversion` | GA4 MP + Meta CAPI (`/api/clearance-callback`) | ✅ | ⚠️ via callback path |
| Contact form | `form_submission` (analytics) | `contact_form_conversion` GA4 MP + Meta CAPI | ❌ **email only, no CRM lead** | ❌ |
| Phone `tel:` | `phone_conversion` | Meta CAPI | n/a | n/a |
| Email / WhatsApp | `email_conversion` / `whatsapp_conversion` | Meta CAPI | n/a | n/a |
| Vehicle-check / Job application | (correctly **not** conversions) | — | — | — |

---

## 2. Per-hop PASS / BREAK

| # | Hop | Status | Evidence |
|---|---|---|---|
| 1 | gclid/utm URL → sessionStorage `pr_tracking` | ✅ | Playwright: `{"gclid":"PNLSTEST123","utm_source":"test",…}` captured on load |
| 1b | Persistence across navigation | ✅ | `pr_tracking` intact after `/ → /contact` nav |
| 2 | sessionStorage → CRM payload (quote) | ✅ | `quote-mapper.ts` maps `utmSource/gclid` → `attribution` block |
| 2b | sessionStorage → CRM payload (callback) | ❌→✅ | `deliverCallbackLead` dropped attribution; **fixed PR #20** |
| 2c | sessionStorage → CRM payload (contact) | ❌ | `/api/contact` never posts to CRM (Resend email only) |
| 3 | dataLayer event fires (`phone_conversion`) | ✅ | Playwright tel: click → `{"event":"phone_conversion","tel_target":"01172870082"…}` |
| 3b | Contact event-name vs GTM trigger | ❌ | Site pushes `form_submission`; **published** GTM has no `form_submission` trigger and waits on `contact_form_submit` (never pushed) |
| 4 | GTM tag → GA4 / Google Ads / Meta | ⚠️ | Published container missing 4 triggers + 3 Ads tags (see §4); GA4 page_view collection confirmed in prod data |
| 5 | Consent gating (denied default → granted) | ✅ | Default `ad_storage/analytics_storage = denied`; CookieYes `analytics:no` until accept, then `yes` |
| 6 | payload → webhook → CRM `attributions` | ❌→✅ | `ingestQuote/Contact/Callback` never called `writeAttributionRow`; **fixed PR #54** |
| 7 | PII in calculator result URLs | ✅ (no leak) | Result URL is AES-encrypted `?quote=…&sig=…`; PII goes to hidden `__pl_user_data__` DOM, never dataLayer |

---

## 3. Root cause of each headline issue

- **`quote_calculator_complete` (155 events) not counted** — it is an *engagement* event, never marked a GA4 key event, and not imported to Google Ads. Code is correct; this is a console flag (§7).
- **`phone_conversion` barely fires (5/90d)** — the dataLayer push **works** (verified). The shortfall is (a) consent-denied gating for non-accepting users and (b) the **published** GTM container's limited Ads-tag coverage — not a code bug.
- **Contact-form events absent (0/90d)** — three-way mismatch: site pushes `form_submission`; published GTM listens for `contact_form_submit`; neither has a matching live trigger/tag; the server-side `contact_form_conversion` (GA4 MP) implies ~no genuine contact submissions in the window. Also the contact form never creates a CRM lead.
- **Attribution collapse (no google/cpc; ~all (direct)/(none))** — consistent with Consent Mode denied-by-default (no Conversion Linker write until consent) plus the stale published container. Capture itself works once a URL carries gclid/utm.
- **`attributions` empty (0 rows)** — see §4.

---

## 4. Verdict on the empty `attributions` table — **(a) broken pipeline**

Two independent, code-certain breaks — **not** "(b) no paid conversions":

1. **CRM never wrote attributions for native leads.** `writeAttributionRow()` is correct and accepts gclid, but it was called **only** from the affiliate webhook (which requires a mandatory `affiliate_code`). `ingestQuote` put gclid/utm into `jobs.intake_details` JSON and never wrote `attributions`; `ingestContact`/`ingestCallback` had no attribution field at all. → with a *perfect* gclid, `attributions` would still be 0.
   *Exact hop:* `painless-crm/src/lib/webhooks/quote.ts › ingestQuote` (and contact/callback) — missing `writeAttributionRow` call. **Fixed in PR #54.**
2. **Stale GTM publish** — the corrected container was never published (§7 GTM), so several Ads conversion tags don't exist in production.

**Live corroboration (read-only):** 30 webhook_events (25 quote + 5 callback) and 75 native jobs since Jun 1 carry **0 gclid and 0 utm** — consistent with all-organic/direct traffic in the window AND with the fact that the quote path only forwards attribution when the URL actually had it. **Playwright settles capture:** a `?gclid=PNLSTEST123` visit *does* persist gclid and the quote-mapper *does* forward it — so the missing piece was the CRM write, now fixed. (The runtime quote→CRM hop was not exercised end-to-end to avoid creating a production lead; the forwarding code path is verified by read + unit tests.)

---

## 5. Fixed in code (PRs)

### Painless-CRM PR #54 — `fix/attributions-wiring`
https://github.com/Soborbo/Painless-CRM/pull/54
- New `writeLeadAttribution()` helper (best-effort, never rolls back a lead).
- Called from `ingestQuote`, `ingestContact`, `ingestCallback` → writes a canonical `attributions` row linked to job + customer carrying source/campaign/utm/gclid/fbclid/landing_page.
- Optional `attribution` block added to contact & callback inbound schemas.
- `pnpm typecheck` clean; 51 webhook/attribution tests pass (added gclid cases).

### painlessremovals PR #20 — `fix/forward-attribution-callback`
https://github.com/Soborbo/painlessremovals/pull/20
- `attribution` block added to `callbackWebhookSchema` (and `contactWebhookSchema` for parity).
- Threaded through `CallbackLeadInput` → `deliverCallbackLead`.
- `/api/callbacks` now lifts gclid/utm/landing_page/session_id/heard_about out of calculator state and forwards it.
- `tsc` clean on changed files; 20 crm schema tests pass.

---

## 6. Verified working (Playwright, production)

| Test | Result |
|---|---|
| gclid + utm captured to `sessionStorage.pr_tracking` | ✅ |
| Persists across page navigation | ✅ |
| Consent Mode v2 default = denied (ad + analytics) | ✅ |
| CookieYes denied→granted toggles consent cookie | ✅ (`analytics:no`→`yes`) |
| `tel:` click → `phone_conversion` dataLayer push | ✅ (event_id + tel_target) |
| GTM-PXTH5JJK loads | ✅ |
| Calculator result URL = encrypted, no PII querystring | ✅ |

*Caveat:* GA4/Ads/Meta network **beacons** under granted consent were not captured in the headless harness (timing/automation); GA4's 5,271 production page_views confirm collection works for real consented users. For tag-level confirmation use GTM **Preview** + Tag Assistant.

---

## 7. Manual actions still required (NOT code)

### GTM `GTM-PXTH5JJK` — **publish the corrected container** (highest priority)
The live published container is **stale**. Compared to the `workspace_v2`/`48` export, production is **missing** triggers + tags for:
- `contact_form_conversion` (incl. its Google Ads tag), `clearance_callback_conversion`, `form_submission`, `instant_quote_cta_click`.
- Only **2** Google Ads conversion (`awct`) tags are live vs **5** in the export (missing phone / contact-form / clearance).

Steps: open container → review workspace `48`/`v2` → confirm triggers listen on the event names the site actually pushes (esp. align `contact_form_submit` ↔ `form_submission`) → **Submit / Publish**. Re-verify in Preview.

### GA4 `413271735`
- Mark **key events**: `quote_calculator_complete`, `whatsapp_conversion`, `email_conversion` (and confirm `phone_conversion`, `callback_conversion`).
- Retire `Thank_you_page_view_lead` once the contact form fires a real event.
- Confirm the calculator PII fix (no PII params in result URLs) — already encrypted.

### Google Ads `4886655031`
- Enable **Enhanced Conversions for Leads** per conversion action (user-provided data is already on the hidden `__pl_user_data__` DOM element + GTM variables).
- Reduce ~23 conversion actions to ~5 **Primary** (Quote / Callback / Phone / Contact form / Clearance callback); demote the rest to Secondary.
- **Import** `quote_calculator_complete`.

### Consent Mode verification
Run GTM Preview in denied and granted states; confirm Conversion Linker writes only after grant and tags fire post-consent.

---

## 8. Test data to clean up

**None.** All Supabase access was read-only (SELECT only); **no CRM rows were created**. The Playwright run did **not** submit any production lead — it only read storage/dataLayer and fired a synthetic `tel:` click (no network conversion). The tag `PNLSTEST123` exists only in a transient sessionStorage value in the test browser.

---

## Appendix — live data snapshot (90 days)

GA4 events: `quote_calculator_complete` 155, `callback_conversion` 18, `quote_calculator_conversion` 14, `phone_conversion` 5, `whatsapp_conversion` 3, `email_conversion` 1, `Thank_you_page_view_lead` 1; **no** `contact_form_*` / `form_submission`. Supabase: `attributions` 0, `offline_conversion_uploads` 0, `webhook_events` 30 (0 gclid), `jobs` 1709. Offline/Enhanced-Conversions-to-Ads upload is **schema-only** in the CRM (no producer, uploader, or cron) — a future build, out of scope here.
