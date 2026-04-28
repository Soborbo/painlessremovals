/**
 * Tracking constants. Anything that's a magic number or a brittle endpoint
 * URL belongs here so it can be tuned without hunting through call sites.
 */

export const CURRENCY = 'GBP' as const;
export const DEFAULT_COUNTRY = 'GB' as const;

/** Window during which a kalkulátor completion can be "upgraded" by a
 *  higher-intent action (phone click, callback form). After this elapses
 *  without an upgrade, we fire `quote_calculator_conversion` as a late
 *  conversion. */
export const QUOTE_UPGRADE_WINDOW_MS = 60 * 60 * 1000;

/** Grace window after `QUOTE_UPGRADE_WINDOW_MS` during which a returning
 *  user still gets the late-conversion fired on next page-load. Beyond
 *  this, the state is dropped entirely. */
export const QUOTE_LATE_CATCHUP_MS = 24 * 60 * 60 * 1000;

/** Minimum dwell time before a `form_abandonment` ping is allowed. Below
 *  this we assume bot / accidental focus and skip. */
export const ABANDONMENT_MIN_DWELL_MS = 10 * 1000;

/** localStorage key for the active quote state. */
export const QUOTE_STATE_KEY = 'pl_quote_state';

/** Hidden DOM element id used as a side-channel for PII (so it never lands
 *  in `window.dataLayer`). */
export const USER_DATA_ELEMENT_ID = '__pl_user_data__';

/** localStorage key for the persisted user data side-channel. The DOM
 *  element is per-page-load only; this key survives page closes so a
 *  late conversion fired by `boot.ts` after the user reopens the site
 *  can restore the user data onto the DOM and into the Meta CAPI mirror
 *  payload. Same trust posture as `setUserDataOnDOM`: stored locally,
 *  never sent to dataLayer or third-party scripts. */
export const USER_DATA_STORAGE_KEY = 'pl_user_data';

/** Endpoint used by `navigator.sendBeacon()` for abandonment events. */
export const ABANDONMENT_BEACON_URL = '/api/track/abandonment';

/** Endpoint used by the client to mirror conversion events to Meta CAPI
 *  with a shared `event_id` for browser+server dedup. */
export const META_CAPI_ENDPOINT = '/api/meta/capi';

/** BroadcastChannel name for cross-tab sync of quote state mutations. */
export const QUOTE_STATE_CHANNEL = 'pl_quote_state_v1';

/** Meta Graph API version. Pinned (not "latest") so a Meta-side breaking
 *  change can't silently break our CAPI ingestion — bump this deliberately
 *  after testing in Events Manager. */
export const META_GRAPH_API_VERSION = 'v22.0';

/** localStorage key for the persistent ViewContent-fired flag. Lives in
 *  its OWN key (not inside the quote state blob) so it survives
 *  `deleteState()` and Meta ViewContent fires once per browser even
 *  across re-completions. */
export const VIEW_CONTENT_FIRED_KEY = 'pl_view_content_fired';

/** TTL for at-rest user-data side-channel in localStorage. After this,
 *  the blob is auto-purged on next read; we don't keep PII around longer
 *  than needed for the late-conversion CAPI mirror. */
export const USER_DATA_TTL_MS = 24 * 60 * 60 * 1000;
