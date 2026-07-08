/**
 * Public surface for the tracking system. Components and pages should
 * import from `@/lib/tracking` rather than reaching into individual
 * modules — that keeps the conversion contract centralized.
 */

export {
  trackEvent,
  trackEventBeforeNavigate,
  setUserDataOnDOM,
  clearUserDataOnDOM,
  readUserDataFromDOM,
  restoreUserDataFromStorage,
  adStorageConsent,
  normalizePhoneE164,
  normalizeUserData,
  type UserData,
  type CountryCode,
  type TrackingParams,
  type ConsentDecision,
} from './tracking';

export {
  fireQuoteConversion,
  wasQuoteCompletedRecently,
  getRecentQuoteDetails,
  cleanupLegacyQuoteState,
  markViewContentFired,
  hasViewContentFired,
} from './conversion-state';

export {
  trackFormStart,
  trackFormFieldFocus,
  trackFormStep,
  trackFormSubmitted,
  registerFormForAbandonment,
  markActiveFormsAsHandedOff,
} from './form-tracking';

export { initGlobalListeners } from './global-listeners';

export { dispatchWorkerConversion } from './worker-dispatch';

export { generateUUID } from './uuid';

export {
  captureUTMs,
  readAttribution,
  readAffiliateCode,
  buildAttribution,
  type AttributionParams,
} from './utm-capture';

export { CURRENCY, DEFAULT_COUNTRY } from './config';
