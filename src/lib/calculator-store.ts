/**
 * PAINLESS REMOVALS - CALCULATOR STORE
 *
 * Nanostores state management for multi-step form.
 * Persists to localStorage for save & continue.
 */

import { computed, map } from 'nanostores';
import { z } from 'zod';
import {
  calculateQuote,
  calculateHouseClearance,
  getModifiedCuft,
  getResourcesForProperty,
  getResourcesFromCubes,
  getResourcesForFurnitureOnly,
  getCubesForOffice,
  applyComplications,
  type QuoteResult,
} from './calculator-logic';
import { CALCULATOR_CONFIG } from './calculator-config';
import { trackError } from '@/lib/errors/tracker';
import type {
  PropertySize,
  OfficeSize,
  SliderPosition,
  Complication,
  PackingSize,
} from './calculator-config';

// ===================
// TYPES
// ===================

export type ServiceType = 'home' | 'office' | 'clearance';
export type DateFlexibility = 'fixed' | 'flexible' | 'unknown';

export interface FurnitureOnlyData {
  itemCount: number;
  needs2Person: boolean;
  over40kg: boolean;
  specialistItems: string[];
  otherSpecialistDescription?: string;
}

export interface AddressData {
  formatted: string;
  postcode: string;
  lat?: number;
  lng?: number;
  floorLevel?: number; // -1 (basement) to 10
}

export interface DistanceData {
  depotToFrom: number;
  fromToTo: number;
  toToDepot: number;
  driveTimeHours: number;
  customerDistance: number; // Just from → to (for display)
  customerDriveMinutes: number;
}

export type ExtrasGatewayOption = 'packing' | 'assembly' | 'cleaning' | 'storage';
export type PackingTier = 'materials' | 'fragile' | 'fullService';
export type CleaningType = 'quick' | 'deep';
export type StorageDuration = 1 | 4 | 8 | 12 | 26 | 52 | 'other';

export interface DisassemblyItem {
  category: keyof typeof CALCULATOR_CONFIG.assembly;
  quantity: number;
}

export interface ClearanceDisposalItem {
  type: keyof typeof CALCULATOR_CONFIG.houseClearance.disposal;
  quantity: number;
}

export type ClearanceAccessDifficulty = keyof typeof CALCULATOR_CONFIG.houseClearance.accessDifficulties;

export interface ClearanceData {
  disposalItems: ClearanceDisposalItem[];
  accessDifficulties: ClearanceAccessDifficulty[];
}

export interface ExtrasData {
  // Gateway selection - which extras to show
  gateway: ExtrasGatewayOption[];

  // Packing (materials, fragile, or full service)
  packingTier?: PackingTier;

  // Disassembly items with quantities
  disassemblyItems: DisassemblyItem[];

  // Cleaning
  cleaningRooms?: number;
  cleaningType?: CleaningType;

  // Storage
  storageSize?: keyof typeof CALCULATOR_CONFIG.storage;
  storageWeeks?: number;

  // Legacy fields for backwards compatibility
  packing?: PackingSize;
  storage?: keyof typeof CALCULATOR_CONFIG.storage;
  assembly: Array<{
    type: keyof typeof CALCULATOR_CONFIG.assembly;
    quantity: number;
  }>;
}

export interface ContactData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gdprConsent: boolean;
  marketingConsent: boolean;
}

export interface CalculatorState {
  // Meta
  currentStep: number;
  highestStepReached: number;
  startedAt: string | null;
  lastUpdatedAt: string | null;

  // Step 1: Service Type
  serviceType: ServiceType | null;

  // Step 2: Property/Office/Furniture
  propertySize: PropertySize | null;
  officeSize: OfficeSize | null;
  furnitureOnly: FurnitureOnlyData | null;

  // Step 3: Belongings
  sliderPosition: SliderPosition;

  // Step 4: Manual Override
  useManualOverride: boolean;
  manualMen: number | null;
  manualVans: number | null;

  // Step 5: Date
  dateFlexibility: DateFlexibility | null;
  selectedDate: string | null; // ISO string

  // Step 6: Complications
  complications: Complication[] | null;

  // Step 7: Property Chain
  propertyChain: boolean | null;

  // Step 8: Addresses (combined from/to)
  fromAddress: AddressData | null;
  toAddress: AddressData | null;
  distances: DistanceData | null;

  // Step 9: Key Wait Waiver
  keyWaitWaiver: boolean | null;

  // Clearance data
  clearance: ClearanceData;

  // Step 10: Extras
  extras: ExtrasData;

  // Step 11: Contact
  contact: ContactData;

  // Tracking
  gclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPage: string | null;
  sessionId: string | null;
  quoteId: string | null;
}

// ===================
// INITIAL STATE
// ===================

export const initialState: CalculatorState = {
  currentStep: 1,
  highestStepReached: 1,
  startedAt: null,
  lastUpdatedAt: null,

  serviceType: null,
  propertySize: null,
  officeSize: null,
  furnitureOnly: null,
  sliderPosition: 3, // Default: Average

  useManualOverride: false,
  manualMen: null,
  manualVans: null,

  dateFlexibility: null,
  selectedDate: null,

  complications: null,
  propertyChain: null,

  fromAddress: null,
  toAddress: null,
  distances: null,

  keyWaitWaiver: null,

  clearance: {
    disposalItems: [],
    accessDifficulties: [],
  },

  extras: {
    gateway: [],
    disassemblyItems: [],
    assembly: [],
  },

  contact: {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    gdprConsent: false,
    marketingConsent: false,
  },

  gclid: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  landingPage: null,
  sessionId: null,
  quoteId: null,
};

// ===================
// STORE
// ===================

export const calculatorStore = map<CalculatorState>(initialState);

// ===================
// VALIDATION SCHEMA
// ===================

/**
 * Zod schema for validating localStorage data
 * This prevents XSS attacks from modifying localStorage
 */
export const LocalStorageStateSchema = z.object({
  currentStep: z.number().min(1).max(12).or(z.literal(5.5)).or(z.number().min(10.1).max(10.4)),
  highestStepReached: z.number().min(1).max(12).optional(),
  startedAt: z.string().nullable(),
  lastUpdatedAt: z.string().nullable(),
  serviceType: z.enum(['home', 'office', 'clearance']).nullable(),
  propertySize: z.string().nullable(),
  officeSize: z.string().nullable(),
  furnitureOnly: z.object({
    itemCount: z.number().min(1).max(10),
    needs2Person: z.boolean(),
    over40kg: z.boolean(),
    specialistItems: z.array(z.string()),
    otherSpecialistDescription: z.string().optional(),
  }).nullable(),
  sliderPosition: z.number().min(1).max(5),
  useManualOverride: z.boolean(),
  manualMen: z.number().min(1).max(10).nullable(),
  manualVans: z.number().min(1).max(5).nullable(),
  dateFlexibility: z.enum(['fixed', 'flexible', 'unknown']).nullable(),
  selectedDate: z.string().nullable(),
  complications: z.array(z.string()).nullable(),
  propertyChain: z.boolean().nullable(),
  keyWaitWaiver: z.boolean().nullable().optional(),
  fromAddress: z.object({
    formatted: z.string(),
    postcode: z.string(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    floorLevel: z.number().min(-1).max(10).optional(),
  }).nullable(),
  toAddress: z.object({
    formatted: z.string(),
    postcode: z.string(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    floorLevel: z.number().min(-1).max(10).optional(),
  }).nullable(),
  distances: z.object({
    depotToFrom: z.number(),
    fromToTo: z.number(),
    toToDepot: z.number(),
    driveTimeHours: z.number(),
    customerDistance: z.number(),
    customerDriveMinutes: z.number(),
  }).nullable(),
  clearance: z.object({
    disposalItems: z.array(z.object({
      type: z.string(),
      quantity: z.number().min(0).max(99),
    })),
    accessDifficulties: z.array(z.string()),
  }).optional(),
  extras: z.object({
    gateway: z.array(z.enum(['packing', 'assembly', 'cleaning', 'storage'])),
    packingTier: z.enum(['materials', 'fragile', 'fullService']).optional(),
    disassemblyItems: z.array(z.object({
      category: z.string(),
      quantity: z.number().min(1).max(9),
    })),
    cleaningRooms: z.number().min(1).max(6).optional(),
    cleaningType: z.enum(['quick', 'deep']).optional(),
    storageSize: z.string().optional(),
    storageWeeks: z.number().min(1).max(52).optional(),
    packing: z.string().optional(),
    storage: z.string().optional(),
    assembly: z.array(z.object({
      type: z.string(),
      quantity: z.number(),
    })),
  }),
  contact: z.object({
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    phone: z.string().max(20),
    email: z.string().max(255),
    gdprConsent: z.boolean(),
    marketingConsent: z.boolean(),
  }),
  gclid: z.string().max(200).nullable(),
  utmSource: z.string().max(100).nullable(),
  utmMedium: z.string().max(100).nullable(),
  utmCampaign: z.string().max(100).nullable(),
  landingPage: z.string().max(500).nullable(),
  sessionId: z.string().nullable(),
  quoteId: z.string().max(64).nullable().optional(),
}).passthrough(); // Allow additional properties for forwards compatibility

// ===================
// COMPUTED VALUES
// ===================

/**
 * Get the steps that apply to the current flow
 * Step 9 is now combined with Step 8 (addresses on one page)
 * Furniture/Single item flow skips: Plan (4), Access (6), Chain (7), Extras (10)
 * Office flow skips: Items (3)
 * Studio skips: Items (3)
 *
 * Extras sub-steps (10.1, 10.2, 10.3, 10.4) are conditionally shown based on gateway selection
 */
export const applicableSteps = computed(calculatorStore, (state): number[] => {
  const isFurniture = state.propertySize === 'furniture';
  const isOffice = state.serviceType === 'office';
  const isClearance = state.serviceType === 'clearance';
  const isStudio = state.propertySize === 'studio';
  const gateway = state.extras.gateway || [];

  // Build extras sub-steps based on gateway selection
  const extrasSubSteps: number[] = [];
  if (gateway.includes('packing')) extrasSubSteps.push(10.1);
  if (gateway.includes('assembly')) extrasSubSteps.push(10.2);
  if (gateway.includes('cleaning')) extrasSubSteps.push(10.3);
  if (gateway.includes('storage')) extrasSubSteps.push(10.4);

  // Clearance flow: 1, 2 (items), 3 (access), 8 (address - single location), 11, 12
  // Furniture flow: 1, 2, 5, 8, 11, 12 (skip 3, 4, 6, 7, 9, 10)
  // Office flow: 1, 2, 5, 6, 8, 10, [extras sub-steps], 11, 12 (skip 3, 4, 7, 9 — offices don't have property chains)
  // Studio flow: 1, 2, 4, 5, 6, 7, 8, 9, 10, [extras sub-steps], 11, 12 (skip 3)
  // Full flow: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, [extras sub-steps], 11, 12

  if (isClearance) {
    return [1, 2, 3, 8, 11, 12];
  }

  if (isFurniture) {
    return [1, 2, 5, 8, 11, 12];
  }

  if (isOffice) {
    return [1, 2, 5, 6, 8, 10, ...extrasSubSteps, 11, 12];
  }

  if (isStudio) {
    return [1, 2, 4, 5, 6, 7, 8, 9, 10, ...extrasSubSteps, 11, 12];
  }

  // Full home flow
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...extrasSubSteps, 11, 12];
});

/**
 * Current step progress percentage based on applicable steps
 */
export const progressPercent = computed(calculatorStore, (state) => {
  const steps = applicableSteps.get();
  const currentIndex = steps.indexOf(state.currentStep);
  if (currentIndex === -1) return 0;
  return Math.round(((currentIndex + 1) / steps.length) * 100);
});

/**
 * Progress message for current step
 */
export const progressMessage = computed(calculatorStore, (state) => {
  return CALCULATOR_CONFIG.progressMessages[state.currentStep] || CALCULATOR_CONFIG.progressMessages[Math.floor(state.currentStep)] || '';
});

/**
 * Calculated cubes based on current selections
 */
export const calculatedCubes = computed(calculatorStore, (state) => {
  if (state.serviceType === 'office' && state.officeSize) {
    return getCubesForOffice(state.officeSize);
  }

  if (state.propertySize && state.propertySize !== 'furniture') {
    return getModifiedCuft(state.propertySize, state.sliderPosition);
  }

  return 0;
});

/**
 * Recommended resources based on cubes
 */
export const recommendedResources = computed(calculatorStore, (state) => {
  try {
    // Furniture only
    if (state.furnitureOnly) {
      const hasSpecialist = state.furnitureOnly.specialistItems.length > 0;
      return getResourcesForFurnitureOnly({
        itemCount: state.furnitureOnly.itemCount,
        needs2Person: state.furnitureOnly.needs2Person,
        over40kg: state.furnitureOnly.over40kg,
        hasSpecialist,
      });
    }

    // Office
    if (state.serviceType === 'office' && state.officeSize) {
      const cubes = getCubesForOffice(state.officeSize);
      return getResourcesFromCubes(cubes);
    }

    // Home (v4.2: use property-based resource calculation)
    if (state.propertySize && state.propertySize !== 'furniture') {
      return getResourcesForProperty(state.propertySize, state.sliderPosition);
    }

    return null;
  } catch (e) {
    trackError('CALC-PRICE-001', e, { phase: 'resource-calculation', serviceType: state.serviceType || 'unknown' }, 'calculator-store');
    return null;
  }
});

/**
 * Final resources (recommended or manual override)
 * Note: Inlined recommendedResources logic to avoid .get() reactivity issues in nanostores
 */
export const finalResources = computed(calculatorStore, (state) => {
  // Calculate recommended resources inline (don't use .get() on other computed stores)
  let recommended = null;

  try {
    if (state.furnitureOnly) {
      const hasSpecialist = state.furnitureOnly.specialistItems.length > 0;
      recommended = getResourcesForFurnitureOnly({
        itemCount: state.furnitureOnly.itemCount,
        needs2Person: state.furnitureOnly.needs2Person,
        over40kg: state.furnitureOnly.over40kg,
        hasSpecialist,
      });
    } else if (state.serviceType === 'office' && state.officeSize) {
      const cubes = getCubesForOffice(state.officeSize);
      recommended = getResourcesFromCubes(cubes);
    } else if (state.propertySize && state.propertySize !== 'furniture') {
      recommended = getResourcesForProperty(state.propertySize, state.sliderPosition);
    }
  } catch (e) {
    trackError('CALC-PRICE-001', e, { phase: 'final-resources', serviceType: state.serviceType || 'unknown' }, 'calculator-store');
    return null;
  }

  if (!recommended) return null;

  if (state.useManualOverride && state.manualMen && state.manualVans) {
    return {
      men: state.manualMen,
      vans: state.manualVans,
      workTime: recommended.workTime,
      cuft: recommended.cuft,
      loadTime: recommended.workTime, // legacy alias
      requiresCallback: recommended.requiresCallback,
    };
  }

  return { ...recommended, loadTime: recommended.workTime }; // legacy alias
});

/**
 * Whether callback is required
 * Note: Inlined cubes calculation to avoid .get() reactivity issues
 */
export const requiresCallback = computed(calculatorStore, (state) => {
  // Specialist furniture items
  if (state.furnitureOnly?.specialistItems.length) {
    return { required: true, reason: 'specialist_items' };
  }

  // 5bed-plus always requires survey (v4.2)
  if (state.propertySize === '5bed-plus') {
    return { required: true, reason: 'large_property' };
  }

  // Calculate cubes inline (don't use .get() on other computed stores)
  let cubes = 0;
  if (state.serviceType === 'office' && state.officeSize) {
    cubes = getCubesForOffice(state.officeSize);
  } else if (state.propertySize && state.propertySize !== 'furniture') {
    cubes = getModifiedCuft(state.propertySize, state.sliderPosition);
  }

  // Large cuft (> 2250 = survey required, v4.2)
  if (cubes > CALCULATOR_CONFIG.thresholds.callbackRequired) {
    return { required: true, reason: 'large_property' };
  }

  // Complication points >= 6 → survey required (v4.2)
  if (state.complications && state.complications.length > 0) {
    const compResult = applyComplications(state.complications);
    if (compResult.requiresSurvey) {
      return { required: true, reason: 'complication_survey' };
    }
  }

  return { required: false };
});

/**
 * Full quote calculation
 * Note: All calculations inlined to avoid .get() reactivity issues in nanostores
 */
export const quoteResult = computed(calculatorStore, (state): QuoteResult | null => {
  // Need minimum data
  if (!state.distances) return null;

  // House clearance uses a separate calculation path
  if (state.serviceType === 'clearance') {
    try {
      const clearanceItems = state.clearance.disposalItems.filter(i => i.quantity > 0);
      if (clearanceItems.length === 0) return null;

      const clearanceResult = calculateHouseClearance({
        disposalItems: clearanceItems,
        accessDifficulties: state.clearance.accessDifficulties,
        distances: state.distances,
      });

      // Adapt to QuoteResult shape. Clamp marginedTotal to 0 — when
      // mileage + disposal + access surcharges exceed the gross total
      // the unconstrained subtraction goes negative and downstream
      // breakdown computation (`crewCost * marginRatio`) explodes to
      // NaN once `controllableCost` is zero.
      const marginedTotalRaw = clearanceResult.totalPrice
        - clearanceResult.breakdown.mileageCost
        - clearanceResult.breakdown.disposalCost;
      return {
        totalPrice: clearanceResult.totalPrice,
        men: 0,
        vans: 0,
        cubes: 0,
        workTime: 0,
        loadTime: 0,
        totalJobTime: 0,
        serviceDuration: 'Clearance',
        serviceDays: 1,
        isHalfDay: false,
        billingType: 'halfDay' as const,
        warningZone: false,
        requiresCallback: false,
        showMultiDayWarning: false,
        surcharge: null,
        moversCost: 0,
        breakdown: {
          crewCost: 0,
          vansCost: 0,
          controllableCost: 0,
          surchargeCost: 0,
          marginMultiplier: 1,
          marginedTotal: Math.max(0, marginedTotalRaw),
          margin: 0,
          mileageCost: clearanceResult.breakdown.mileageCost,
          accommodationCost: 0,
          keyWaitWaiverCost: 0,
          extrasCost: clearanceResult.breakdown.disposalCost,
          passThroughCost: clearanceResult.breakdown.mileageCost + clearanceResult.breakdown.disposalCost,
          complicationExtraCrew: 0,
        },
      };
    } catch (e) {
      trackError('CALC-PRICE-001', e, { phase: 'clearance-quote' }, 'calculator-store');
      return null;
    }
  }

  // Check for callback requirement inline
  if (state.furnitureOnly?.specialistItems.length) {
    return null; // Requires callback
  }
  if (state.propertySize === '5bed-plus') {
    return null; // Requires callback (v4.2)
  }
  let cubes = 0;
  if (state.serviceType === 'office' && state.officeSize) {
    cubes = getCubesForOffice(state.officeSize);
  } else if (state.propertySize && state.propertySize !== 'furniture') {
    cubes = getModifiedCuft(state.propertySize, state.sliderPosition);
  }
  if (cubes > CALCULATOR_CONFIG.thresholds.callbackRequired) {
    return null; // Requires callback
  }
  // Complication survey check (v4.2)
  if (state.complications && state.complications.length > 0) {
    const compResult = applyComplications(state.complications);
    if (compResult.requiresSurvey) {
      return null; // Requires callback
    }
  }

  try {
    return calculateQuote({
      serviceType: state.serviceType || 'home',
      ...(state.propertySize && { propertySize: state.propertySize }),
      sliderPosition: state.sliderPosition,
      ...(state.officeSize && { officeSize: state.officeSize }),
      ...(state.furnitureOnly && { furnitureOnly: {
        itemCount: state.furnitureOnly.itemCount,
        needs2Person: state.furnitureOnly.needs2Person,
        over40kg: state.furnitureOnly.over40kg,
        hasSpecialist: state.furnitureOnly.specialistItems.length > 0,
      } }),
      complications: state.complications || [],
      propertyChain: state.propertyChain || false,
      distances: state.distances,
      extras: state.extras,
      keyWaitWaiver: state.keyWaitWaiver || false,
      ...(state.useManualOverride && state.manualMen && state.manualVans && {
        manualOverride: { men: state.manualMen, vans: state.manualVans }
      }),
      ...(state.selectedDate && { selectedDate: state.selectedDate }),
    });
  } catch (e) {
    trackError('CALC-PRICE-001', e, { phase: 'quote-calculation', serviceType: state.serviceType || 'unknown' }, 'calculator-store');
    return null;
  }
});

// ===================
// ACTIONS
// ===================

/**
 * Parse step number from URL pathname
 * e.g., /calculator/step-01 → 1, /calculator/step-10a → 10.1
 */
function getStepFromUrl(): number | null {
  if (typeof window === 'undefined') return null;

  const path = window.location.pathname;

  // Special case: step-5b maps to 5.5 (date picker sub-step)
  if (path.includes('step-5b')) return 5.5;

  const match = path.match(/\/calculator\/step-(\d+)([a-d])?/);

  if (!match) return null;

  const stepNum = parseInt(match[1]!, 10);
  const subStep = match[2];

  // Handle sub-steps (10a → 10.1, 10b → 10.2, etc.)
  if (subStep) {
    const subStepMap: Record<string, number> = { a: 0.1, b: 0.2, c: 0.3, d: 0.4 };
    return stepNum + (subStepMap[subStep] || 0);
  }

  return stepNum;
}

/**
 * Sync currentStep from URL (handles browser back/forward navigation)
 */
export function syncStepFromUrl() {
  const urlStep = getStepFromUrl();
  if (urlStep !== null) {
    const currentStep = calculatorStore.get().currentStep;
    if (currentStep !== urlStep) {
      calculatorStore.setKey('currentStep', urlStep);
      saveState();
    }
  }
}

const SESSION_KEY = 'painless_calc_state';

/**
 * Initialize store (call on mount)
 */
export function initializeStore() {
  if (typeof window !== 'undefined') {
    // Restore state from sessionStorage (survives MPA page navigations, dies on tab close)
    //
    // We run the parsed blob through LocalStorageStateSchema before touching
    // the store so that a tampered/corrupt sessionStorage entry can't inject
    // arbitrary values — the schema was added as an XSS mitigation but
    // previously wasn't wired into the load path.
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const raw = JSON.parse(saved);
        if (raw && typeof raw === 'object') {
          const result = LocalStorageStateSchema.partial().safeParse(raw);
          if (result.success) {
            for (const [key, value] of Object.entries(result.data)) {
              if (value !== undefined) {
                calculatorStore.setKey(key as keyof CalculatorState, value as never);
              }
            }
          } else {
            // Silently discard invalid state rather than crash the calculator.
            sessionStorage.removeItem(SESSION_KEY);
          }
        }
      }
    } catch { /* ignore corrupt data */ }

    // Capture URL params (only on first visit, don't overwrite restored values)
    const state = calculatorStore.get();
    if (!state.sessionId) {
      const params = new URLSearchParams(window.location.search);
      calculatorStore.setKey('gclid', params.get('gclid'));
      calculatorStore.setKey('utmSource', params.get('utm_source'));
      calculatorStore.setKey('utmMedium', params.get('utm_medium'));
      calculatorStore.setKey('utmCampaign', params.get('utm_campaign'));
      calculatorStore.setKey('landingPage', window.location.pathname);
      calculatorStore.setKey('sessionId', crypto.randomUUID());
      calculatorStore.setKey('startedAt', new Date().toISOString());
    }

    calculatorStore.setKey('lastUpdatedAt', new Date().toISOString());

    // Sync step from URL
    syncStepFromUrl();
  }
}

/**
 * Persist state to sessionStorage (survives MPA navigations, dies on tab close)
 */
export function saveState() {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(calculatorStore.get()));
    } catch { /* storage full or unavailable */ }
  }
}

/**
 * Clear saved state
 */
export function clearState() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('quote_submitted');
  }
  calculatorStore.set(initialState);
}

/**
 * Convert step number to URL path
 */
export function stepNumberToUrl(step: number): string {
  // Step 1 lives at /instantquote/ (the entry URL); steps 2+ at /step-XX/.
  if (step === 1) return '/instantquote/';

  let stepId: string;

  // Handle sub-steps (10.1, 10.2, etc.)
  if (step === 5.5) stepId = '5b';
  else if (step === 10.1) stepId = '10a';
  else if (step === 10.2) stepId = '10b';
  else if (step === 10.3) stepId = '10c';
  else if (step === 10.4) stepId = '10d';
  else stepId = Math.floor(step).toString().padStart(2, '0');

  return `/instantquote/step-${stepId}/`;
}

/**
 * Navigate to a step URL
 */
function navigateToStep(step: number) {
  if (typeof window !== 'undefined') {
    // Step 12 (quote/result) now lives at /instantquote/your-quote/
    if (step === 12) {
      window.location.href = '/instantquote/your-quote/';
    } else {
      window.location.href = stepNumberToUrl(step);
    }
  }
}

/**
 * Go to next step in the flow (respects applicable steps)
 */
export function nextStep() {
  const current = calculatorStore.get().currentStep;
  const steps = applicableSteps.get();
  const currentIndex = steps.indexOf(current);

  if (currentIndex >= 0 && currentIndex < steps.length - 1) {
    const nextStepNum = steps[currentIndex + 1]!;
    calculatorStore.setKey('currentStep', nextStepNum);
    saveState();
    navigateToStep(nextStepNum);
  }
}

/**
 * Go to previous step in the flow (respects applicable steps)
 */
export function prevStep() {
  const current = calculatorStore.get().currentStep;
  const steps = applicableSteps.get();
  const currentIndex = steps.indexOf(current);

  if (currentIndex > 0) {
    const prevStepNum = steps[currentIndex - 1]!;
    calculatorStore.setKey('currentStep', prevStepNum);
    saveState();
    navigateToStep(prevStepNum);
  }
}

/**
 * Go to specific step
 */
export function goToStep(step: number, navigate: boolean = true) {
  // Allow steps 1-12, step 5.5 (date picker), and sub-steps 10.1-10.4
  const isValidStep = (step >= 1 && step <= 12) ||
    step === 5.5 ||
    (step >= 10.1 && step <= 10.4);

  if (isValidStep) {
    calculatorStore.setKey('currentStep', step);
    // Track the furthest step the user has reached
    const current = calculatorStore.get().highestStepReached;
    if (step > current) {
      calculatorStore.setKey('highestStepReached', step);
    }
    saveState();
    if (navigate) {
      navigateToStep(step);
    }
  }
}

/**
 * Set service type (Step 1)
 *
 * Resets every field that's collected in a service-specific step so a
 * partial answer set from the prior service can't leak into pricing
 * for the new one. The previous version only cleared a subset and
 * left e.g. `complications` / `extras` carrying over, which produced
 * silently-wrong office quotes after a Home → Office switch.
 */
export function setServiceType(type: ServiceType) {
  calculatorStore.setKey('serviceType', type);

  // Service-specific Step 2 / Step 3 answers
  calculatorStore.setKey('propertySize', null);
  calculatorStore.setKey('officeSize', null);
  calculatorStore.setKey('furnitureOnly', null);

  // Answers from steps that may be skipped in the new flow.
  calculatorStore.setKey('propertyChain', null);
  calculatorStore.setKey('keyWaitWaiver', null);
  calculatorStore.setKey('complications', null);
  calculatorStore.setKey('selectedDate', null);
  calculatorStore.setKey('dateFlexibility', null);
  calculatorStore.setKey('useManualOverride', false);
  calculatorStore.setKey('manualMen', null);
  calculatorStore.setKey('manualVans', null);

  // Reset extras + clearance to fresh empty containers (object identity
  // matters — `setKey('extras', {})` would not match the typed shape).
  calculatorStore.setKey('extras', { gateway: [], disassemblyItems: [], assembly: [] });
  calculatorStore.setKey('clearance', { disposalItems: [], accessDifficulties: [] });

  saveState();
}

/**
 * Set property size (Step 2 - Home)
 */
export function setPropertySize(size: PropertySize) {
  calculatorStore.setKey('propertySize', size);
  saveState();
}

/**
 * Set office size (Step 2 - Office)
 */
export function setOfficeSize(size: OfficeSize) {
  calculatorStore.setKey('officeSize', size);
  saveState();
}

/**
 * Set furniture only data (Step 2 - Furniture)
 */
export function setFurnitureOnly(data: FurnitureOnlyData) {
  calculatorStore.setKey('furnitureOnly', data);
  saveState();
}

/**
 * Set slider position (Step 3)
 */
export function setSliderPosition(position: SliderPosition) {
  calculatorStore.setKey('sliderPosition', position);
  saveState();
}

/**
 * Set manual override (Step 4)
 */
export function setManualOverride(men: number, vans: number) {
  calculatorStore.setKey('useManualOverride', true);
  calculatorStore.setKey('manualMen', men);
  calculatorStore.setKey('manualVans', vans);
  saveState();
}

/**
 * Clear manual override (use recommendation)
 */
export function clearManualOverride() {
  calculatorStore.setKey('useManualOverride', false);
  calculatorStore.setKey('manualMen', null);
  calculatorStore.setKey('manualVans', null);
  saveState();
}

/**
 * Set date (Step 5)
 */
export function setDate(flexibility: DateFlexibility, date?: string) {
  calculatorStore.setKey('dateFlexibility', flexibility);
  calculatorStore.setKey('selectedDate', date || null);
  saveState();
}

/**
 * Set complications (Step 6)
 */
export function setComplications(complications: Complication[]) {
  calculatorStore.setKey('complications', complications);
  saveState();
}

/**
 * Toggle complication
 */
export function toggleComplication(complication: Complication) {
  const current = calculatorStore.get().complications || [];
  const index = current.indexOf(complication);

  if (index === -1) {
    calculatorStore.setKey('complications', [...current, complication]);
  } else {
    calculatorStore.setKey('complications', current.filter(c => c !== complication));
  }
  saveState();
}

/**
 * Set property chain (Step 7)
 */
export function setPropertyChain(isChain: boolean) {
  calculatorStore.setKey('propertyChain', isChain);
  saveState();
}

/**
 * Set key wait waiver (Step 9)
 * When true, crew waits up to 2 hours for keys — charged at £20/hr per mover
 */
export function setKeyWaitWaiver(wantsWaiver: boolean) {
  calculatorStore.setKey('keyWaitWaiver', wantsWaiver);
  saveState();
}

/**
 * Set clearance disposal items
 */
export function setClearanceItems(items: ClearanceDisposalItem[]) {
  const current = calculatorStore.get().clearance;
  calculatorStore.setKey('clearance', { ...current, disposalItems: items });
  saveState();
}

/**
 * Set clearance access difficulties
 */
export function setClearanceAccessDifficulties(difficulties: ClearanceAccessDifficulty[]) {
  const current = calculatorStore.get().clearance;
  calculatorStore.setKey('clearance', { ...current, accessDifficulties: difficulties });
  saveState();
}

/**
 * Set from address (Step 8)
 */
export function setFromAddress(address: AddressData) {
  calculatorStore.setKey('fromAddress', address);
  saveState();
}

/**
 * Set to address (Step 9)
 */
export function setToAddress(address: AddressData) {
  calculatorStore.setKey('toAddress', address);
  saveState();
}

/**
 * Set distances (after both addresses are set)
 */
export function setDistances(distances: DistanceData) {
  calculatorStore.setKey('distances', distances);
  saveState();
}

/**
 * Set extras (Step 10)
 */
export function setExtras(extras: Partial<ExtrasData>) {
  const current = calculatorStore.get().extras;
  calculatorStore.setKey('extras', { ...current, ...extras });
  saveState();
}

/**
 * Set extras gateway selection (Step 10)
 */
export function setExtrasGateway(gateway: ExtrasGatewayOption[]) {
  const current = calculatorStore.get().extras;
  calculatorStore.setKey('extras', { ...current, gateway });
  saveState();
}

/**
 * Toggle extras gateway option
 */
export function toggleExtrasGateway(option: ExtrasGatewayOption) {
  const current = calculatorStore.get().extras;
  const gateway = current.gateway || [];
  const index = gateway.indexOf(option);

  if (index === -1) {
    calculatorStore.setKey('extras', { ...current, gateway: [...gateway, option] });
  } else {
    calculatorStore.setKey('extras', { ...current, gateway: gateway.filter(o => o !== option) });
  }
  saveState();
}

/**
 * Set packing tier (Step 10a)
 */
export function setPackingTier(tier: PackingTier) {
  const current = calculatorStore.get().extras;
  calculatorStore.setKey('extras', { ...current, packingTier: tier });
  saveState();
}

/**
 * Set disassembly items (Step 10b)
 */
export function setDisassemblyItems(items: DisassemblyItem[]) {
  const current = calculatorStore.get().extras;
  // Also update legacy assembly field for backwards compatibility
  const legacyAssembly = items.map(item => ({
    type: item.category,
    quantity: item.quantity,
  }));
  calculatorStore.setKey('extras', {
    ...current,
    disassemblyItems: items,
    assembly: legacyAssembly,
  });
  saveState();
}

/**
 * Set cleaning details (Step 10c)
 */
export function setCleaningDetails(rooms: number, type: CleaningType) {
  const current = calculatorStore.get().extras;
  calculatorStore.setKey('extras', {
    ...current,
    cleaningRooms: rooms,
    cleaningType: type,
  });
  saveState();
}

/**
 * Set storage details (Step 10d)
 */
export function setStorageDetails(size: keyof typeof CALCULATOR_CONFIG.storage, weeks: number) {
  const current = calculatorStore.get().extras;
  calculatorStore.setKey('extras', {
    ...current,
    storageSize: size,
    storageWeeks: weeks,
    storage: size, // Legacy field
  });
  saveState();
}

/**
 * Add assembly item
 */
export function addAssemblyItem(type: keyof typeof CALCULATOR_CONFIG.assembly, quantity: number) {
  const current = calculatorStore.get().extras.assembly;
  const existing = current.findIndex(item => item.type === type);

  let updated: typeof current;
  if (existing >= 0) {
    updated = current.map((item, i) =>
      i === existing ? { ...item, quantity: item.quantity + quantity } : item
    );
  } else {
    updated = [...current, { type, quantity }];
  }

  calculatorStore.setKey('extras', { ...calculatorStore.get().extras, assembly: updated });
  saveState();
}

/**
 * Remove assembly item
 */
export function removeAssemblyItem(type: keyof typeof CALCULATOR_CONFIG.assembly) {
  const current = calculatorStore.get().extras.assembly;
  calculatorStore.setKey('extras', {
    ...calculatorStore.get().extras,
    assembly: current.filter(item => item.type !== type),
  });
  saveState();
}

/**
 * Set contact info (Step 11)
 */
export function setContact(contact: Partial<ContactData>) {
  const current = calculatorStore.get().contact;
  calculatorStore.setKey('contact', { ...current, ...contact });
  saveState();
}

/**
 * Get state for API submission
 */
export function getSubmissionData() {
  const state = calculatorStore.get();
  const quote = quoteResult.get();

  return {
    // Form data
    serviceType: state.serviceType,
    propertySize: state.propertySize,
    officeSize: state.officeSize,
    furnitureOnly: state.furnitureOnly,
    sliderPosition: state.sliderPosition,
    complications: state.complications,
    propertyChain: state.propertyChain,
    keyWaitWaiver: state.keyWaitWaiver,
    fromAddress: state.fromAddress,
    toAddress: state.toAddress,
    distances: state.distances,
    dateFlexibility: state.dateFlexibility,
    selectedDate: state.selectedDate,
    extras: state.extras,
    contact: state.contact,

    // Quote data
    quote: quote ? {
      totalPrice: quote.totalPrice,
      men: quote.men,
      vans: quote.vans,
      cubes: quote.cubes,
      serviceDuration: quote.serviceDuration,
      breakdown: quote.breakdown,
    } : null,

    // Tracking
    gclid: state.gclid,
    utmSource: state.utmSource,
    utmMedium: state.utmMedium,
    utmCampaign: state.utmCampaign,
    landingPage: state.landingPage,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
  };
}
