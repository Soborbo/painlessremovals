/**
 * CALCULATOR IMAGE MANIFEST
 *
 * Central config for all calculator images with:
 * - SEO-friendly filenames
 * - Descriptive alt texts
 * - Responsive size definitions
 * - Helper to generate <picture> element props
 */

import { CONFIG } from '@/lib/config';



export interface ImageSources {
  avifSrcSet: string;
  webpSrcSet: string;
  jpgSrcSet: string;
  fallbackSrc: string;
  sizes: string;
  alt: string;
  width: number;
  height: number;
}

interface CalcImageEntry {
  /** Directory under /images/calculator/ */
  dir: string;
  /** SEO filename base (no extension, no size suffix) */
  filename: string;
  /** Widths to generate */
  widths: number[];
  /** Descriptive alt text */
  alt: string;
  /** CSS max render width (for sizes attribute) */
  displayWidth: number;
}

// Size presets for different card types
const CARD_SIZES = [220, 440, 660] as const;
const SMALL_CARD_SIZES = [120, 240, 360] as const;
const TINY_CARD_SIZES = [80, 160, 240] as const;
const ILLUSTRATION_SIZES = [480, 768, 1024] as const;

export const CALC_IMAGES = {
  // Step 1 - Service Type
  'step1-home': {
    dir: 'step-01-service-type',
    filename: 'bristol-home-removal-service',
    widths: [...CARD_SIZES],
    alt: 'Professional home removal service in Bristol',
    displayWidth: 220,
  },
  'step1-office': {
    dir: 'step-01-service-type',
    filename: 'bristol-office-removal-service',
    widths: [...CARD_SIZES],
    alt: 'Office removal service in Bristol',
    displayWidth: 220,
  },
  'step1-clearance': {
    dir: 'step-01-service-type',
    filename: 'bristol-house-clearance-service',
    widths: [...CARD_SIZES],
    alt: 'House clearance service in Bristol',
    displayWidth: 220,
  },

  // Step 2 - Home Property Size
  'step2-studio': {
    dir: 'step-02-property-size',
    filename: 'bristol-studio-flat-removal',
    widths: [...CARD_SIZES],
    alt: 'Studio flat removal in Bristol',
    displayWidth: 220,
  },
  'step2-1bed': {
    dir: 'step-02-property-size',
    filename: 'bristol-1-bedroom-removal',
    widths: [...CARD_SIZES],
    alt: '1 bedroom flat removal in Bristol',
    displayWidth: 220,
  },
  'step2-2bed': {
    dir: 'step-02-property-size',
    filename: 'bristol-2-bedroom-removal',
    widths: [...CARD_SIZES],
    alt: '2 bedroom house removal in Bristol',
    displayWidth: 220,
  },
  'step2-3bed-small': {
    dir: 'step-02-property-size',
    filename: 'bristol-3-bed-semi-removal',
    widths: [...CARD_SIZES],
    alt: 'Small 3 bedroom house removal in Bristol',
    displayWidth: 220,
  },
  'step2-3bed-large': {
    dir: 'step-02-property-size',
    filename: 'bristol-3-bed-detached-removal',
    widths: [...CARD_SIZES],
    alt: 'Large 3 bedroom house removal in Bristol',
    displayWidth: 220,
  },
  'step2-4bed': {
    dir: 'step-02-property-size',
    filename: 'bristol-4-bedroom-house-removal',
    widths: [...CARD_SIZES],
    alt: '4 bedroom house removal in Bristol',
    displayWidth: 220,
  },
  'step2-5bed': {
    dir: 'step-02-property-size',
    filename: 'bristol-5-bedroom-house-removal',
    widths: [...CARD_SIZES],
    alt: '5 bedroom house removal in Bristol',
    displayWidth: 220,
  },
  'step2-5bed-plus': {
    dir: 'step-02-property-size',
    filename: 'bristol-large-house-removal',
    widths: [...CARD_SIZES],
    alt: 'Large 5+ bedroom house removal in Bristol',
    displayWidth: 220,
  },
  'step2-furniture': {
    dir: 'step-02-property-size',
    filename: 'bristol-furniture-only-removal',
    widths: [...CARD_SIZES],
    alt: 'Furniture only removal service in Bristol',
    displayWidth: 220,
  },

  // Step 2 - Office Size
  'step2-office-small': {
    dir: 'step-02-property-size',
    filename: 'bristol-small-office-removal',
    widths: [...CARD_SIZES],
    alt: 'Small office removal in Bristol',
    displayWidth: 220,
  },
  'step2-office-medium': {
    dir: 'step-02-property-size',
    filename: 'bristol-medium-office-removal',
    widths: [...CARD_SIZES],
    alt: 'Medium office removal in Bristol',
    displayWidth: 220,
  },
  'step2-office-large': {
    dir: 'step-02-property-size',
    filename: 'bristol-large-office-removal',
    widths: [...CARD_SIZES],
    alt: 'Large office removal in Bristol',
    displayWidth: 220,
  },

  // Step 3 - Belongings Volume
  'step3-minimalist': {
    dir: 'step-03-belongings',
    filename: 'bristol-removal-minimal-belongings',
    widths: [...ILLUSTRATION_SIZES],
    alt: 'Minimalist home with very few belongings for removal',
    displayWidth: 768,
  },
  'step3-light': {
    dir: 'step-03-belongings',
    filename: 'bristol-removal-light-belongings',
    widths: [...ILLUSTRATION_SIZES],
    alt: 'Lightly furnished home with essential furniture for removal',
    displayWidth: 768,
  },
  'step3-average': {
    dir: 'step-03-belongings',
    filename: 'bristol-removal-average-belongings',
    widths: [...ILLUSTRATION_SIZES],
    alt: 'Average furnished home with typical amount of belongings',
    displayWidth: 768,
  },
  'step3-full': {
    dir: 'step-03-belongings',
    filename: 'bristol-removal-full-belongings',
    widths: [...ILLUSTRATION_SIZES],
    alt: 'Well-furnished home packed with belongings for removal',
    displayWidth: 768,
  },
  'step3-packed': {
    dir: 'step-03-belongings',
    filename: 'bristol-removal-packed-belongings',
    widths: [...ILLUSTRATION_SIZES],
    alt: 'Fully packed home with maximum belongings for removal',
    displayWidth: 768,
  },

  // Step 5 - Date Selection
  'step5-fixed': {
    dir: 'step-05-date-selection',
    filename: 'bristol-fixed-date-move',
    widths: [...CARD_SIZES],
    alt: 'Calendar with circled moving date for fixed date removal in Bristol',
    displayWidth: 220,
  },
  'step5-flexible': {
    dir: 'step-05-date-selection',
    filename: 'bristol-flexible-date-move',
    widths: [...CARD_SIZES],
    alt: 'Flexible calendar with multiple date options for removal in Bristol',
    displayWidth: 220,
  },
  'step5-exploring': {
    dir: 'step-05-date-selection',
    filename: 'bristol-exploring-move-options',
    widths: [...CARD_SIZES],
    alt: 'Exploring moving options and budget planning in Bristol',
    displayWidth: 220,
  },

  // Step 6 - Complicating Factors
  'step6-large': {
    dir: 'step-06-complications',
    filename: 'bristol-large-fragile-items',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Large fragile items like piano and artwork for removal',
    displayWidth: 120,
  },
  'step6-over2000': {
    dir: 'step-06-complications',
    filename: 'bristol-heavy-items-over-2000lbs',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Heavy valuable items over 2000 lbs',
    displayWidth: 120,
  },
  'step6-stairs': {
    dir: 'step-06-complications',
    filename: 'bristol-narrow-staircase-removal',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Narrow staircase complicating removal access',
    displayWidth: 120,
  },
  'step6-elevator': {
    dir: 'step-06-complications',
    filename: 'bristol-no-elevator-access',
    widths: [...SMALL_CARD_SIZES],
    alt: 'No elevator access for removal',
    displayWidth: 120,
  },
  'step6-access': {
    dir: 'step-06-complications',
    filename: 'bristol-restricted-access-removal',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Restricted access with narrow streets and limited parking',
    displayWidth: 120,
  },
  'step6-attic': {
    dir: 'step-06-complications',
    filename: 'bristol-attic-items-removal',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Items in loft or attic requiring removal',
    displayWidth: 120,
  },
  'step6-plants': {
    dir: 'step-06-complications',
    filename: 'bristol-large-plant-collection',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Large collection of plants for removal',
    displayWidth: 120,
  },
  'step6-none': {
    dir: 'step-06-complications',
    filename: 'bristol-no-complications',
    widths: [...SMALL_CARD_SIZES],
    alt: 'No complicating factors for removal',
    displayWidth: 120,
  },

  // Step 7 - Property Chain
  'step7-chain-yes': {
    dir: 'step-07-property-chain',
    filename: 'bristol-property-chain-move',
    widths: [...CARD_SIZES],
    alt: 'Property chain move in Bristol',
    displayWidth: 220,
  },
  'step7-chain-no': {
    dir: 'step-07-property-chain',
    filename: 'bristol-independent-move',
    widths: [...CARD_SIZES],
    alt: 'Independent move without property chain',
    displayWidth: 220,
  },

  // Step 9 - Key Wait Waiver
  'step9-keywait-yes': {
    dir: 'step-09-key-wait',
    filename: 'bristol-key-wait-waiver-yes',
    widths: [...TINY_CARD_SIZES],
    alt: 'Key handover wait service for Bristol removal',
    displayWidth: 220,
  },
  'step9-keywait-no': {
    dir: 'step-09-key-wait',
    filename: 'bristol-key-wait-waiver-no',
    widths: [...TINY_CARD_SIZES],
    alt: 'No key wait needed for removal',
    displayWidth: 220,
  },

  // Step 10 - Gateway Extras
  'step10-packing': {
    dir: 'step-10-extras/gateway',
    filename: 'bristol-professional-packing-service',
    widths: [...CARD_SIZES],
    alt: 'Professional packing service for removals in Bristol',
    displayWidth: 220,
  },
  'step10-assembly': {
    dir: 'step-10-extras/gateway',
    filename: 'bristol-furniture-assembly-service',
    widths: [...CARD_SIZES],
    alt: 'Furniture assembly and disassembly service in Bristol',
    displayWidth: 220,
  },
  'step10-cleaning': {
    dir: 'step-10-extras/gateway',
    filename: 'bristol-move-out-cleaning-service',
    widths: [...CARD_SIZES],
    alt: 'End of tenancy cleaning service in Bristol',
    displayWidth: 220,
  },
  'step10-storage': {
    dir: 'step-10-extras/gateway',
    filename: 'bristol-secure-storage-service',
    widths: [...CARD_SIZES],
    alt: 'Secure storage service for removals in Bristol',
    displayWidth: 220,
  },

  // Step 10b - Disassembly
  'step10-disassembly-table': {
    dir: 'step-10-extras/disassembly',
    filename: 'bristol-table-disassembly',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Table disassembly for house move',
    displayWidth: 120,
  },
  'step10-disassembly-frame-bed': {
    dir: 'step-10-extras/disassembly',
    filename: 'bristol-bed-frame-disassembly',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Bed frame disassembly for removal',
    displayWidth: 120,
  },
  'step10-disassembly-bunk-bed': {
    dir: 'step-10-extras/disassembly',
    filename: 'bristol-bunk-bed-disassembly',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Bunk bed disassembly for house move',
    displayWidth: 120,
  },
  'step10-disassembly-complex': {
    dir: 'step-10-extras/disassembly',
    filename: 'bristol-complex-furniture-disassembly',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Complex furniture disassembly service',
    displayWidth: 120,
  },
  'step10-disassembly-gym': {
    dir: 'step-10-extras/disassembly',
    filename: 'bristol-gym-equipment-disassembly',
    widths: [...SMALL_CARD_SIZES],
    alt: 'Gym equipment disassembly for removal',
    displayWidth: 120,
  },
} as const satisfies Record<string, CalcImageEntry>;

export type CalcImageKey = keyof typeof CALC_IMAGES;

/**
 * Generate <picture> element props for a calculator image
 */
export function getImageSources(key: CalcImageKey): ImageSources {
  const config = CALC_IMAGES[key];
  const base = `${CONFIG.site.assetBaseUrl}/images/calculator/${config.dir}/${config.filename}`;

  return {
    avifSrcSet: config.widths.map((w) => `${base}-${w}w.avif ${w}w`).join(', '),
    webpSrcSet: config.widths.map((w) => `${base}-${w}w.webp ${w}w`).join(', '),
    jpgSrcSet: config.widths.map((w) => `${base}-${w}w.jpg ${w}w`).join(', '),
    fallbackSrc: `${base}-${config.widths[0]}w.jpg`,
    sizes: config.displayWidth > 480
      ? `(max-width: 640px) 100vw, ${config.displayWidth}px`
      : `(max-width: 640px) calc(50vw - 24px), ${config.displayWidth}px`,
    alt: config.alt,
    width: config.displayWidth,
    height: config.displayWidth,
  };
}
