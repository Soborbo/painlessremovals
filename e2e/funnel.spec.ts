/**
 * Conversion-funnel e2e suite — all scenarios live in the generic factory
 * (verify/e2e/funnel-factory.ts); this file just binds it to the
 * Painless Removals adapter.
 *
 * Run:  npx playwright test --config e2e
 *   - VERIFY_BASE_URL=<url>  target a running site (otherwise the config
 *     boots `wrangler dev` on the existing dist build at :4321)
 *   - VERIFY_STRICT=1        turn capability-skips (GTM/Turnstile
 *     unreachable) into failures — use against a real URL
 */

import { defineFunnelSpecs } from '../verify/e2e/funnel-factory';
import { adapter } from './adapter';

defineFunnelSpecs(adapter);
