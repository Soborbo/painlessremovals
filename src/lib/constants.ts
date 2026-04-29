/**
 * APPLICATION CONSTANTS
 *
 * Centralized constants to avoid magic numbers throughout the codebase.
 */

// ===================
// TIMING CONSTANTS
// ===================

export const TIMING = {
  /** Fast auto-navigation delay (ms) */
  AUTO_NEXT_FAST: 300,

  /** Slow auto-navigation delay (ms) */
  AUTO_NEXT_SLOW: 400,

  /** Google Maps loading timeout (ms) */
  GOOGLE_MAPS_TIMEOUT: 5000,

  /** Toast auto-dismiss duration (ms) */
  TOAST_DURATION: 4000,

  /** Debounce delay for state saving (ms) */
  STATE_SAVE_DEBOUNCE: 500,
} as const;

// ===================
// STORAGE CONSTANTS
// ===================

export const STORAGE = {
  /** Days until localStorage state expires */
  STATE_EXPIRY_DAYS: 7,

  /** Promotional discount weeks for storage */
  STORAGE_DISCOUNT_WEEKS: 8,

  /** Storage discount percentage (50% off) */
  STORAGE_DISCOUNT_PERCENT: 0.5,
} as const;

// ===================
// VALIDATION CONSTANTS
// ===================

export const VALIDATION = {
  /** Maximum rooms for cleaning service */
  MAX_CLEANING_ROOMS: 6,

  /** Minimum rooms for cleaning service */
  MIN_CLEANING_ROOMS: 1,

  /** Maximum cubes before callback required */
  CALLBACK_CUBES_THRESHOLD: 2000,

  /** Maximum quantity per disassembly item */
  MAX_DISASSEMBLY_QUANTITY: 9,

  /** Quote validity period in days */
  QUOTE_VALID_DAYS: 30,
} as const;

// ===================
// UI CONSTANTS
// ===================

export const UI = {
  /** Maximum vans to display as emojis */
  MAX_VAN_EMOJIS: 4,

  /** Maximum movers to display as emojis */
  MAX_MOVER_EMOJIS: 6,

  /** Slider max items for furniture-only flow */
  FURNITURE_SLIDER_MAX: 10,
} as const;

// ===================
// PACKING SIZE THRESHOLDS
// ===================

// Mirrors `CALCULATOR_CONFIG.packing.{size}.cubesMax` (calculator-config
// imports this file, so we can't import the config back here without a
// cycle). The boundaries MUST match the config: getExtrasCost uses
// these values to pick a packing price tier, and ResultPage uses the
// same boundaries to label the displayed breakdown line. Previously the
// values diverged (500/1000/1750 here vs 750/1350/2000 in the config),
// causing breakdown lines that didn't match the charged total in the
// 501-750 and 1001-1350 cube windows.
export const PACKING_SIZE_THRESHOLDS = {
  SMALL_MAX: 750,
  MEDIUM_MAX: 1350,
  LARGE_MAX: 2000,
} as const;

// ===================
// TYPE EXPORTS
// ===================

export type PackingSizeCategory = 'small' | 'medium' | 'large' | 'xl';

/**
 * Get packing size category based on cubes. Single source of truth for
 * both billing (`getExtrasCost`) and display (`ResultPage`'s breakdown
 * label) so the breakdown line price always matches the total.
 */
export function getPackingSizeCategory(cubes: number): PackingSizeCategory {
  if (cubes <= PACKING_SIZE_THRESHOLDS.SMALL_MAX) return 'small';
  if (cubes <= PACKING_SIZE_THRESHOLDS.MEDIUM_MAX) return 'medium';
  if (cubes <= PACKING_SIZE_THRESHOLDS.LARGE_MAX) return 'large';
  return 'xl';
}
