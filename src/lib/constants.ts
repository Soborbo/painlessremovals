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
  /** localStorage key for calculator state */
  CALCULATOR_STATE_KEY: 'painless-calculator-state',

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

export const PACKING_SIZE_THRESHOLDS = {
  SMALL_MAX: 500,
  MEDIUM_MAX: 1000,
  LARGE_MAX: 1750,
} as const;

// ===================
// TYPE EXPORTS
// ===================

export type PackingSizeCategory = 'small' | 'medium' | 'large' | 'xl';

/**
 * Get packing size category based on cubes
 */
export function getPackingSizeCategory(cubes: number): PackingSizeCategory {
  if (cubes <= PACKING_SIZE_THRESHOLDS.SMALL_MAX) return 'small';
  if (cubes <= PACKING_SIZE_THRESHOLDS.MEDIUM_MAX) return 'medium';
  if (cubes <= PACKING_SIZE_THRESHOLDS.LARGE_MAX) return 'large';
  return 'xl';
}
