/**
 * CALCULATOR IMAGE PRELOAD / PREFETCH HELPERS
 *
 * Two consumers, two goals:
 *
 *  A) Server (index.astro + [step].astro): emit `<link rel="preload"
 *     as="image">` for the CURRENT step's images in <head>, so they start
 *     downloading WITH the HTML instead of waiting for React to hydrate.
 *     (The step body renders client-side only — CalculatorStepRenderer
 *     returns null until `storeReady` — so without this the browser never
 *     sees the image URLs until hydration finishes.)
 *
 *  B) Client (CalculatorStepRenderer): inject `<link rel="prefetch"
 *     as="image">` for the NEXT step's images, branch-aware, so they're
 *     already cached by the time the user advances.
 *
 * SAFETY (why this can't break tracking or navigation):
 *   These functions only describe resource hints. They never touch the
 *   nanostore, navigation (`navigateToStep` / `window.location`), or
 *   tracking. A preloaded/prefetched resource runs NO JavaScript and does
 *   NOT change `location.pathname`, so it cannot fire a phantom
 *   `form_step_complete` or `form_abandonment` — those fire client-side on
 *   the real page after hydration.
 *   DO NOT change these hints to `rel="prerender"` (or a speculation-rules
 *   prerender): that WOULD execute the target page in the background and
 *   fire its tracking, corrupting step analytics.
 *
 * COVERAGE:
 *   The manifest-backed <picture> steps (1, 2, 3, 5, 6, 7, 9, 10b) plus the
 *   single-src gateway step (10). The packing/cleaning/storage sub-steps
 *   (10a/10c/10d) and the clearance/furniture step-2/3 variants use other
 *   image components (not the CALC_IMAGES manifest) and are intentionally
 *   not covered here — add them later if those screens also "pop in".
 */

import { CONFIG } from '@/lib/config';
import { CALC_IMAGES, getImageSources, type CalcImageKey } from '@/lib/calculator-images';

export interface StepPreloadImages {
  /** Manifest-backed responsive <picture> images. */
  manifestKeys: CalcImageKey[];
  /** Single-URL AVIF images (e.g. gateway icons), as the component requests them. */
  simpleAvifUrls: string[];
}

const EMPTY: StepPreloadImages = { manifestKeys: [], simpleAvifUrls: [] };

// --- Per-screen image-key groups (kept in sync with the step components) ---

const SERVICE_TYPE_KEYS: CalcImageKey[] = ['step1-home', 'step1-office', 'step1-clearance'];
const HOME_SIZE_KEYS: CalcImageKey[] = [
  'step2-furniture', 'step2-studio', 'step2-1bed', 'step2-2bed',
  'step2-3bed-small', 'step2-3bed-large', 'step2-4bed', 'step2-5bed', 'step2-5bed-plus',
];
const OFFICE_SIZE_KEYS: CalcImageKey[] = ['step2-office-small', 'step2-office-medium', 'step2-office-large'];
const BELONGINGS_KEYS: CalcImageKey[] = ['step3-minimalist', 'step3-light', 'step3-average', 'step3-full', 'step3-packed'];
const DATE_KEYS: CalcImageKey[] = ['step5-fixed', 'step5-flexible', 'step5-exploring'];
const COMPLICATION_KEYS: CalcImageKey[] = [
  'step6-stairs', 'step6-access', 'step6-attic', 'step6-elevator', 'step6-large', 'step6-plants', 'step6-none',
];
const CHAIN_KEYS: CalcImageKey[] = ['step7-chain-yes', 'step7-chain-no'];
const KEYWAIT_KEYS: CalcImageKey[] = ['step9-keywait-yes', 'step9-keywait-no'];
const DISASSEMBLY_KEYS: CalcImageKey[] = [
  'step10-disassembly-table', 'step10-disassembly-frame-bed', 'step10-disassembly-bunk-bed',
  'step10-disassembly-complex', 'step10-disassembly-gym',
];
// Gateway uses root-relative single-src JPGs via <PictureImg>, which derives
// the .avif sibling. Mirror that exactly.
const GATEWAY_AVIF_URLS = ['packing', 'disassembly', 'cleaning', 'storage'].map(
  (n) => `/images/calculator/extras/${n}.avif`,
);

/**
 * Images for the NEXT step (client-side, branch known from the store).
 * Keyed by the numeric step id used in `applicableSteps`.
 */
export function getStepPreloadImages(
  stepNumber: number,
  ctx: { serviceType: string | null },
): StepPreloadImages {
  switch (stepNumber) {
    case 1:
      return { manifestKeys: SERVICE_TYPE_KEYS, simpleAvifUrls: [] };
    case 2:
      if (ctx.serviceType === 'office') return { manifestKeys: OFFICE_SIZE_KEYS, simpleAvifUrls: [] };
      if (ctx.serviceType === 'clearance') return EMPTY; // Step2ClearanceItems — non-manifest
      return { manifestKeys: HOME_SIZE_KEYS, simpleAvifUrls: [] };
    case 3:
      if (ctx.serviceType === 'clearance') return EMPTY; // Step3ClearanceAccess — non-manifest
      return { manifestKeys: BELONGINGS_KEYS, simpleAvifUrls: [] };
    case 5:
      return { manifestKeys: DATE_KEYS, simpleAvifUrls: [] };
    case 6:
      return { manifestKeys: COMPLICATION_KEYS, simpleAvifUrls: [] };
    case 7:
      return { manifestKeys: CHAIN_KEYS, simpleAvifUrls: [] };
    case 9:
      return { manifestKeys: KEYWAIT_KEYS, simpleAvifUrls: [] };
    case 10:
      return { manifestKeys: [], simpleAvifUrls: GATEWAY_AVIF_URLS };
    case 10.2:
      return { manifestKeys: DISASSEMBLY_KEYS, simpleAvifUrls: [] };
    default:
      return EMPTY;
  }
}

/**
 * Images for the CURRENT step (server-side). The server doesn't know the
 * user's prior answers (they live in client sessionStorage), so only the
 * steps whose image set is FIXED regardless of branch are emitted here.
 * Branchy steps (02 home/office/clearance, 03 belongings/clearance) are
 * covered by the client-side next-step prefetch from the previous step.
 */
export function getCurrentStepPreloadImages(stepId: string): StepPreloadImages {
  switch (stepId) {
    case 'step-01':
      return { manifestKeys: SERVICE_TYPE_KEYS, simpleAvifUrls: [] };
    case 'step-05':
      return { manifestKeys: DATE_KEYS, simpleAvifUrls: [] };
    case 'step-06':
      return { manifestKeys: COMPLICATION_KEYS, simpleAvifUrls: [] };
    case 'step-07':
      return { manifestKeys: CHAIN_KEYS, simpleAvifUrls: [] };
    case 'step-09':
      return { manifestKeys: KEYWAIT_KEYS, simpleAvifUrls: [] };
    case 'step-10':
      return { manifestKeys: [], simpleAvifUrls: GATEWAY_AVIF_URLS };
    case 'step-10b':
      return { manifestKeys: DISASSEMBLY_KEYS, simpleAvifUrls: [] };
    default:
      return EMPTY;
  }
}

export interface ServerImagePreloadLink {
  /** Responsive AVIF srcset (manifest images) — pairs with imagesizes. */
  imagesrcset?: string;
  imagesizes?: string;
  /** Single AVIF URL (simple images). */
  href?: string;
}

/**
 * Build the <link rel="preload" as="image"> descriptors for a step's <head>.
 * Manifest images use `imagesrcset`/`imagesizes` so the browser resolves the
 * exact same responsive variant the on-page <picture> will request (no
 * double download). Simple images use a single `href`.
 */
export function getServerImagePreloadLinks(stepId: string): ServerImagePreloadLink[] {
  const { manifestKeys, simpleAvifUrls } = getCurrentStepPreloadImages(stepId);
  const links: ServerImagePreloadLink[] = [];
  for (const key of manifestKeys) {
    const sources = getImageSources(key);
    links.push({ imagesrcset: sources.avifSrcSet, imagesizes: sources.sizes });
  }
  for (const href of simpleAvifUrls) {
    links.push({ href });
  }
  return links;
}

/**
 * A single representative AVIF URL for cross-navigation prefetch
 * (`rel="prefetch"` doesn't reliably honour imagesrcset). Picks the smallest
 * available width that covers `displayWidth × dpr` — matching what the
 * on-page <picture> requests in the common desktop@1–2x case.
 */
export function getRepresentativeAvifUrl(key: CalcImageKey, dpr = 1): string {
  const cfg = CALC_IMAGES[key];
  const widths: readonly number[] = cfg.widths;
  const target = cfg.displayWidth * Math.min(Math.max(dpr, 1), 2);
  const width = widths.find((w) => w >= target) ?? widths[widths.length - 1];
  return `${CONFIG.site.assetBaseUrl}/images/calculator/${cfg.dir}/${cfg.filename}-${width}w.avif`;
}
