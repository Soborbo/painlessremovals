# GTM Container Audit Checklist

**Container**: `GTM-PXTH5JJK` ("Google Tag Gateway")

This checklist must be completed **manually in the GTM UI** before the
merged Worker goes live (Phase 6 of MIGRATION_PLAN.md). The codebase
fires the events listed below; the container needs the matching tags
and triggers to actually do something with them.

A backup of the existing container is in `GTM-PXTH5JJK_workspace_v2.json`
(import via Admin → Import Container if you need a reference).

---

## 0. Working workspace

- [ ] Open https://tagmanager.google.com/ → container `GTM-PXTH5JJK`
- [ ] Create new workspace: `merge-calculator-audit`
- [ ] Verify the existing tags are present from the calc deployment

## 1. Consent Mode v2 default (Rule #5)

- [ ] Verify a CookieYes CMP tag exists on the **Consent Initialization
  - All Pages** built-in trigger.
- [ ] Verify the consent default in `src/components/GTMHead.astro` matches
  what CookieYes expects (ad_storage, analytics_storage, ad_user_data,
  ad_personalization, functionality_storage, personalization_storage,
  security_storage).
- [ ] Test: open the deployed site in an incognito window, DevTools →
  console → check that `dataLayer[0]` is the `consent`/`default` push.

## 2. Conversion events (Google Ads + Meta + GA4)

For each row below, verify **all three columns** exist as tags. The new
events introduced by this merge are highlighted with **NEW**.

| Event name | Google Ads Conversion tag | Meta Custom Event tag | GA4 Event tag |
|---|---|---|---|
| `contact_form_conversion` **NEW** | required | required (`event_id` forwarded for CAPI dedup) | required |
| `phone_conversion` **NEW** | required | required (`event_id` forwarded) | required |
| `email_conversion` **NEW** | required | required | required |
| `whatsapp_conversion` **NEW** | required | required | required |
| `quote_calculator_conversion` (existing from calc) | verify still present | verify still present | verify still present |

**Checks per row**:
- [ ] Trigger fires only on the named event (Custom Event matching exact
      name). NOT on `form_submission` — that's analytics-only.
- [ ] Tag pulls `event_id` from a Data Layer Variable named `event_id`
      (case-sensitive). For Meta CAPI dedup, the same `event_id` must
      flow to both Browser-Pixel and CAPI sides.
- [ ] User-data forwarding: PII reads from the hidden DOM element
      (selector `#pr_user_data` data-attributes), NOT from dataLayer.
      Variables: `User Data — Email (DOM)`, `User Data — Phone (DOM)`,
      etc.

## 3. Analytics-only events (GA4 only, NO conversion fire)

These should **NOT** be wired to Google Ads conversions:

- [ ] `form_submission` — generic GA4 Event tag, parameters: `form_name`,
      `form_source`, `event_id`. Trigger: Custom Event = `form_submission`.
- [ ] `instant_quote_cta_click` **NEW** — GA4 Event tag, parameter:
      `source_page`. Trigger: Custom Event = `instant_quote_cta_click`.
- [ ] `quote_calculator_complete` (existing from calc) — verify still
      analytics-only.
- [ ] `form_abandonment` — verify wired to GA4 only, not conversions.
- [ ] `scroll_50`, `scroll_90` — engagement tracking, GA4 only.
- [ ] `web_vitals` — perf monitoring, GA4 custom dimensions.

## 4. Removed events (must be cleaned up)

The website used to fire `tracking_params` and a per-form `form_submission`
with UTM payload. The new code no longer fires `tracking_params`, and
the `form_submission` payload is leaner (form_name, form_source,
event_id only — UTMs removed because GTM Variables can pull them from
sessionStorage).

- [ ] Delete or disable any tag triggered on `tracking_params` (no longer
      fired by the codebase).
- [ ] If any tag previously read `utm_source`/`utm_medium`/etc. directly
      off the `form_submission` event, repoint it to a sessionStorage-
      backed Variable instead (`Custom JavaScript`:
      `function() { try { return JSON.parse(sessionStorage.getItem('pr_tracking') || '{}').utm_source || ''; } catch (e) { return ''; } }`)
      — same pattern for the other UTM keys, gclid, fbclid.

## 5. Variables to confirm exist

- [ ] Data Layer Variable: `event_id`
- [ ] Data Layer Variable: `form_name`
- [ ] Data Layer Variable: `form_source`
- [ ] Data Layer Variable: `source_page`
- [ ] Custom JavaScript Variables for sessionStorage attribution:
      `Tracking — utm_source`, `Tracking — utm_medium`,
      `Tracking — utm_campaign`, `Tracking — utm_term`,
      `Tracking — utm_content`, `Tracking — gclid`, `Tracking — fbclid`.
- [ ] DOM Variables for hidden user-data element: `User Data — Email`,
      `User Data — Phone`, `User Data — First Name`, `User Data — Last Name`,
      `User Data — City`, `User Data — Postal Code`, `User Data — Country`.

## 6. Preview mode validation

Before publishing:

- [ ] Enable Preview mode, paste the deployed Worker URL (or production
      domain after rollout).
- [ ] Click through these flows and verify the expected tag fires:
  - [ ] Homepage load → `gtm.js`, `consent` default, page_view, optionally
        `tracking_params` if entering with UTMs.
  - [ ] Click `tel:` link → `phone_conversion` tag fires (Google Ads,
        Meta, GA4).
  - [ ] Click `mailto:` link → `email_conversion`.
  - [ ] Click WhatsApp link → `whatsapp_conversion`.
  - [ ] Click any `/instantquote/` CTA → `instant_quote_cta_click`
        (analytics only — no conversion fire).
  - [ ] Submit contact form (Turnstile passes, Resend sends email) →
        `form_submission` (analytics) AND `contact_form_conversion`
        (conversion). Server-side mirror visible in Meta Events Manager
        within seconds.
  - [ ] Submit jobs / affiliate / partner-register / clearance-callback
        forms → ONLY `form_submission` event. NO conversion fire.
  - [ ] Complete a calculator quote → `quote_calculator_complete`
        (analytics) and, after upgrade action like phone-click,
        `quote_calculator_conversion` (conversion).

## 7. Publish

- [ ] Once Preview validates, publish workspace `merge-calculator-audit`
      with version notes referencing this merge.

---

## Out of scope

- Container migration to a different account or property.
- Switching pixel IDs / Ads conversion IDs (those env vars stay the same).
- BigQuery export, Looker Studio dashboards.
