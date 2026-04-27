/**
 * Public surface for the tracking system. Components and pages should
 * import from `@/lib/tracking` rather than reaching into individual
 * modules — that keeps the upgrade-state contract centralized.
 */

export {
  trackEvent,
  setUserDataOnDOM,
  clearUserDataOnDOM,
  readUserDataFromDOM,
  restoreUserDataFromStorage,
  normalizePhoneE164,
  normalizeUserData,
  type UserData,
  type CountryCode,
  type TrackingParams,
} from './tracking';

export {
  resetQuoteState,
  getActiveQuoteState,
  markQuoteUpgraded,
  markViewContentFired,
  resumeQuoteTimer,
  type QuoteState,
} from './conversion-state';

export {
  trackFormStart,
  trackFormFieldFocus,
  trackFormStep,
  trackFormSubmitted,
} from './form-tracking';

export { initGlobalListeners } from './global-listeners';

export { mirrorMetaCapi } from './meta-mirror';

export { generateUUID } from './uuid';

export { captureUTMs, readAttribution, type AttributionParams } from './utm-capture';

export { CURRENCY, DEFAULT_COUNTRY } from './config';
