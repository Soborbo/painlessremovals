/**
 * One-shot client bootstrap. Imported from a bundled `<script>` block in
 * page layouts so it runs once per page-load.
 *
 * Order matters: `restoreUserDataFromStorage()` MUST run before
 * `resumeQuoteTimer()`, because the timer may immediately fire a late
 * `quote_calculator_conversion` whose Meta CAPI mirror reads user data
 * from the DOM element. If the user closed the tab and reopened later,
 * the DOM element doesn't exist on a fresh page-load — restoring from
 * localStorage rebuilds it so CAPI still has hashed identifiers.
 *
 * No View Transitions hooks: the site runs as a hard-navigation MPA.
 */

import { resumeQuoteTimer } from './conversion-state';
import { initGlobalListeners } from './global-listeners';
import { restoreUserDataFromStorage } from './tracking';

restoreUserDataFromStorage();
resumeQuoteTimer();
initGlobalListeners();
