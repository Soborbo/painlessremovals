# INVARIANTS

Rules that, if broken, silently cost money or leak PII. They are
enforced by code where possible and by review otherwise. Numbered for
reference; never renumber.

## 1. PII never goes into `dataLayer`

`trackEvent()` silently strips the full `PII_KEYS` set (`user_data`,
`user_email`, `user_phone`, `email`, `phone`, `phone_number`,
`first_name`, `last_name`, `name`, `street`, `city`, `postal_code`,
`postcode`, plus Meta Advanced Matching short-codes `em`/`ph`/`fn`/`ln`)
and warns in dev with the list of stripped keys. The guard is name-based,
not value-based — passing a PII string under a non-PII key is NOT caught.
Add new PII-shaped fields to `PII_KEYS` in `tracking.ts`. Persistent PII
lives in a hidden DOM element (`__pl_user_data__`) and a TTL'd
localStorage blob; GTM Variables read it from the DOM.

## 2. Every `trackEvent` call has an `event_id`

Either passed in (preferred — when there's a server mirror to dedup
against) or generated inside `trackEvent` via `generateUUID()`. Meta
deduplicates Browser + CAPI by this ID.

## 3. Quote conversion fires once per upgrade window

`resetQuoteState()` starts the window. `markQuoteUpgraded()` consumes
it. `fireQuoteConversionIfStillActive()` is the only path that fires
`quote_calculator_conversion` — never call the event name directly.

## 4. Server-side mirrors are scoped

`save-quote.ts` mirrors `quote_calculator_complete`.
`/api/meta/capi` is the single ingress for client-driven Meta CAPI.
`/api/contact` mirrors `contact_form_conversion`.
Don't add server-side fires from anywhere else; if a new event needs
one, route it through `/api/meta/capi`.

## 5. Consent default is the first script in `<head>`

`<GTMHead />` enforces this — Consent Mode v2 default (everything
denied except `security_storage`) ships before the GTM bootstrap. Don't
reorder. CookieYes loads inside the GTM container on the
`Consent Initialization - All Pages` trigger.

## 6. `form_abandonment` is best-effort

`pagehide` and `visibilitychange` are unreliable on mobile. Treat
abandonment as directional, not exact. The endpoint forwards to GA4 MP
server-side as a best-effort backstop.

## 7. Phone numbers normalize to E.164 before hashing

`normalizePhoneE164` defaults to GB. Hostile or test data with raw
formats won't dedupe correctly with the browser-side Pixel.

## 8. Hashing for Meta CAPI happens server-side

`setUserDataOnDOM` stores raw values (Google Ads UPD needs raw — Google
hashes inside the tag). Meta CAPI requires SHA-256 of normalized
values; we hash in `lib/tracking/server.ts` using `@noble/hashes`,
once per field.

## 9. `viewContentFired` lives in its own localStorage key

`VIEW_CONTENT_FIRED_KEY` is separate from `QUOTE_STATE_KEY` so a
calculator re-run (which calls `deleteState()`) doesn't refire Meta
ViewContent. The flag is set once per browser; clearing localStorage
manually is the only way to retrigger.

## 10. `readState()` runtime-validates the shape

Schema drift (older deploy added a field, newer dropped one, hostile
extension wrote junk) does NOT crash. The corrupt blob is dropped and
state returns to `null`.

## 11. CAPI + abandonment endpoints fail closed on Origin

Missing or non-allowlisted Origin → 403. No `*` CORS, no implicit
trust of same-origin without verification. The OPTIONS preflight
responder echoes only the requesting allowed origin.

## 12. CAPI custom_data is whitelisted

Only `value`, `currency`, `content_name` are forwarded to Meta.
- `value`: 0 ≤ v ≤ 1,000,000.
- `currency`: ISO-4217 (regex `^[A-Z]{3}$`).
- `content_name`: 1-200 chars.
Anything else is dropped. Smart Bidding consumes value/currency for
optimisation; a hostile client could otherwise poison the signal.

## 13. CAPI `event_source_url` is pinned to our origin

The client can suggest a value but the server only accepts URLs whose
`origin === SITE_ORIGIN`. Falls back to the `Referer` header (also
checked) and finally to the bare site origin. Prevents attribution
spoofing where a malicious site could drive Meta credit to our pixel.

## 14. CAPI checks Consent Mode in payload, not just on the client

The client gates on `ad_storage` + `ad_user_data` before sending. The
server re-reads the snapshot from the request body and refuses to
forward to Meta if either is denied. Defense in depth — the client
check saves a round trip, the server check enforces it.
