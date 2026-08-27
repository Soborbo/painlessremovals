/**
 * Tracking constants. Anything that's a magic number or a brittle endpoint
 * URL belongs here so it can be tuned without hunting through call sites.
 */

export const CURRENCY = 'GBP' as const;
export const DEFAULT_COUNTRY = 'GB' as const;

/** How long after a quote completion a phone/email/whatsapp/callback
 *  click is still LABELLED `source: after_calculator` (vs `standalone`)
 *  in reporting. Purely a reporting dimension — the quote conversion
 *  itself fires immediately at completion and every subsequent action
 *  is its own conversion event. */
export const QUOTE_SOURCE_LABEL_WINDOW_MS = 60 * 60 * 1000;

/** localStorage key holding the timestamp of the last quote completion
 *  (feeds the `after_calculator` reporting label above). */
export const QUOTE_COMPLETED_AT_KEY = 'pl_quote_completed_at';

/** Minimum dwell time before a `form_abandonment` ping is allowed. Below
 *  this we assume bot / accidental focus and skip. */
export const ABANDONMENT_MIN_DWELL_MS = 10 * 1000;

/** localStorage key of the RETIRED upgrade-window state blob. Still
 *  referenced for the fired-guard key (`pl_quote_state:fired`, kept so
 *  quotes fired under the old model stay deduped) and for legacy
 *  cleanup in boot. */
export const QUOTE_STATE_KEY = 'pl_quote_state';

/** Hidden DOM element id used as a side-channel for PII (so it never lands
 *  in `window.dataLayer`). */
export const USER_DATA_ELEMENT_ID = '__pl_user_data__';

/** localStorage key for the persisted user data side-channel. A DOM-elem
 *  ennél RÖVIDEBB ideig él: csak az in-page expozíciós ablak végéig
 *  (`USER_DATA_INPAGE_WINDOW_MS`); this key survives navigations so a
 *  conversion dispatched on a LATER page (phone click after leaving the
 *  quote page) still carries user data into the Meta CAPI payload.
 *  Consent-gated: persisted only on an explicit ad_storage grant. Same
 *  trust posture as `setUserDataOnDOM`: stored locally, never sent to
 *  dataLayer or third-party scripts. */
export const USER_DATA_STORAGE_KEY = 'pl_user_data';

/** Endpoint used by `navigator.sendBeacon()` for abandonment events. */
export const ABANDONMENT_BEACON_URL = '/api/track/abandonment';

/** localStorage key for the persistent ViewContent-fired flag. Lives in
 *  its OWN key so Meta ViewContent fires once per browser even across
 *  calculator re-runs. */
export const VIEW_CONTENT_FIRED_KEY = 'pl_view_content_fired';

/** TTL for the at-rest user-data side-channel in localStorage. After
 *  this, the blob is auto-purged on next read — PII isn't kept around
 *  longer than the realistic window in which a later-page conversion
 *  dispatch would still need it. */
export const USER_DATA_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * IN-PAGE EXPOZÍCIÓS ABLAK — meddig maradhat a nyers PII OLVASHATÓ A LAPON.
 *
 * Ez NEM ugyanaz a kérdés, mint a `USER_DATA_TTL_MS`, és nem is verseng vele:
 *
 *   ez az ablak  = „meddig lássa a GTM a rejtett elemet, miután a tagek
 *                   elolvasták" → a DOM-elem élettartama
 *   a 24 órás TTL = „meddig élhet az identitás egy KÉSŐBBI oldalon történő
 *                   konverzióhoz" → a localStorage-blob élettartama
 *
 * Az 5 másodperc a kanonikus mag bevált értéke. Minden új írás ÚJRAINDÍTJA az
 * ablakot, tehát a többlépcsős űrlap nem eshet ki alóla.
 *
 * ⚠️ Az ablak lejárta a DOM-elemet viszi el, az at-rest másolatot NEM. A
 * késleltetett klikk-konverzió ezért a `readUserDataForDispatch()`-en keresztül
 * az at-rest tárra esik vissza — enélkül ez a rövidítés pont azt az identitást
 * ölné meg, amiért a 24 órás ablak létezik.
 */
export const USER_DATA_INPAGE_WINDOW_MS = 5_000;
