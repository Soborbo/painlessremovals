/**
 * PAINLESS REMOVALS - CALCULATOR LOGIC v4.2
 *
 * All calculation functions for the quote calculator.
 * Uses data from calculator-config.ts
 *
 * v4.2: Hourly crew rates (£20/h), flat mileage (£0.43/mi),
 * size-adjusted margins (5×3 matrix on controllables only),
 * point-based complications, 65/35 split-day, surcharges.
 */

import { CALCULATOR_CONFIG } from './calculator-config';
import { getPackingSizeCategory } from './constants';
import type {
  PropertySize,
  OfficeSize,
  SliderPosition,
  Complication,
  PackingSize,
  BillingType,
  SurchargeType,
} from './calculator-config';

// ===================
// TYPES
// ===================

export interface Resources {
  men: number;
  vans: number;
  workTime: number;
  cuft: number;
}

export interface FurnitureOnlyInput {
  itemCount: number;
  needs2Person: boolean;
  over40kg: boolean;
  hasSpecialist: boolean;
}

export interface QuoteInput {
  serviceType: 'home' | 'office' | 'clearance';
  propertySize?: PropertySize;
  sliderPosition?: SliderPosition;
  furnitureOnly?: FurnitureOnlyInput;
  officeSize?: OfficeSize;
  complications: Complication[];
  propertyChain: boolean;
  distances: {
    depotToFrom: number;  // miles depot→origin
    fromToTo: number;     // miles origin→destination (one-way customer distance)
    toToDepot: number;    // miles destination→depot
    driveTimeHours: number;
  };
  extras: {
    packing?: PackingSize;
    cleaningRooms?: number;
    storage?: keyof typeof CALCULATOR_CONFIG.storage;
    assembly?: Array<{
      type: keyof typeof CALCULATOR_CONFIG.assembly;
      quantity: number;
    }>;
  };
  keyWaitWaiver?: boolean;
  manualOverride?: {
    men: number;
    vans: number;
  };
  selectedDate?: string; // ISO date string for surcharge calculation
  forceBilling?: 'singleDay' | 'splitDay' | 'threeDay'; // Force billing type for alternative quote display
}

export interface DayBreakdown {
  day: number;
  label: string;
  hours: number;
  crewCost: number;
  vanCost: number;
  mileageCost: number;
  billingType: BillingType;
}

export interface QuoteResult {
  totalPrice: number;
  men: number;
  vans: number;
  cubes: number;
  workTime: number;
  totalJobTime: number;
  serviceDuration: string;
  serviceDays: number;
  isHalfDay: boolean;
  billingType: BillingType;
  warningZone: boolean;
  requiresCallback: boolean;
  callbackReason?: string;
  showMultiDayWarning: boolean;
  surcharge: { type: SurchargeType; amount: number } | null;
  splitDayBreakdown?: DayBreakdown[];
  breakdown: {
    crewCost: number;
    vansCost: number;
    controllableCost: number;
    surchargeCost: number;
    marginMultiplier: number;
    marginedTotal: number;
    margin: number;
    mileageCost: number;
    accommodationCost: number;
    keyWaitWaiverCost: number;
    extrasCost: number;
    passThroughCost: number;
    complicationExtraCrew: number;
  };

  // Legacy compatibility fields
  loadTime: number;
  moversCost: number;
}

// ===================
// RESOURCE CALCULATION (v4.2)
// ===================

/**
 * Get modified cuft after applying slider multiplier to base cuft
 */
export function getModifiedCuft(
  propertySize: PropertySize,
  sliderPosition: SliderPosition
): number {
  if (propertySize === 'furniture') return 0;

  const property = CALCULATOR_CONFIG.propertyResources[propertySize];
  if (!property) throw new Error(`Unknown property size: ${propertySize}`);

  const slider = CALCULATOR_CONFIG.sliderModifiers[sliderPosition as number];
  if (!slider) throw new Error(`Unknown slider position: ${sliderPosition}`);
  return Math.round(property.baseCuft * slider.multiplier);
}

/**
 * Get work time from cuft bracket boundaries
 */
export function getWorkTimeForCuft(modifiedCuft: number): number | null {
  const { cuftBrackets } = CALCULATOR_CONFIG;

  for (const bracket of cuftBrackets) {
    if (modifiedCuft <= bracket.maxCuft) {
      return bracket.workTime;
    }
  }

  // Above 2250 → free survey required
  return null;
}

/**
 * Calculate resources for a property based on v4.2 rules
 */
export function getResourcesForProperty(
  propertySize: PropertySize,
  sliderPosition: SliderPosition
): Resources & { requiresCallback: boolean; callbackReason?: string } {
  if (propertySize === 'furniture') {
    return { men: 1, vans: 1, workTime: 1, cuft: 0, requiresCallback: false };
  }

  const property = CALCULATOR_CONFIG.propertyResources[propertySize];

  // 5bed-plus → always free survey
  if (!property) {
    return { men: 0, vans: 0, workTime: 0, cuft: 0, requiresCallback: true, callbackReason: 'large_property' };
  }

  const slider = CALCULATOR_CONFIG.sliderModifiers[sliderPosition as number];
  if (!slider) throw new Error(`Unknown slider position: ${sliderPosition}`);
  const modifiedCuft = Math.round(property.baseCuft * slider.multiplier);

  // Vans: ceil(modifiedCuft / 500)
  const vans = Math.ceil(modifiedCuft / 500);

  // Men adjustment based on cuft change
  const cuftDiff = modifiedCuft - property.baseCuft;
  let menAdjustment = 0;
  if (cuftDiff > 0) {
    // +1 man per started 250 cuft increase
    menAdjustment = Math.ceil(cuftDiff / 250);
  } else if (cuftDiff < 0) {
    // -1 man per full 250 cuft decrease
    menAdjustment = -Math.floor(Math.abs(cuftDiff) / 250);
  }
  const men = Math.max(2, property.baseMen + menAdjustment);

  // Work time from bracket lookup
  const workTime = getWorkTimeForCuft(modifiedCuft);

  if (workTime === null) {
    // Above 2250 cuft → free survey
    return { men: 0, vans: 0, workTime: 0, cuft: modifiedCuft, requiresCallback: true, callbackReason: 'large_property' };
  }

  return { men, vans, workTime, cuft: modifiedCuft, requiresCallback: false };
}

/**
 * Get cubes for office size
 */
export function getCubesForOffice(officeSize: OfficeSize): number {
  const office = CALCULATOR_CONFIG.officeCubes[officeSize as string];
  if (!office) throw new Error(`Unknown office size: ${officeSize}`);
  return office.cubes;
}

/**
 * Get resources for furniture-only job
 */
export function getResourcesForFurnitureOnly(input: FurnitureOnlyInput): Resources & { requiresCallback: boolean } {
  const { loadTimeByItems } = CALCULATOR_CONFIG.furnitureOnly;

  if (input.hasSpecialist) {
    return { men: 0, vans: 0, workTime: 0, cuft: 0, requiresCallback: true };
  }

  let workTime = 2.5;
  const thresholds = Object.keys(loadTimeByItems).map(Number).sort((a, b) => a - b);
  for (const threshold of thresholds) {
    if (input.itemCount <= threshold) {
      workTime = loadTimeByItems[threshold] ?? 2.5;
      break;
    }
  }

  let men = 1;
  if (input.needs2Person || input.over40kg) {
    men = 2;
  }

  return { men, vans: 1, workTime, cuft: 0, requiresCallback: false };
}

/**
 * Get resources from cubes (for office and other generic cubes-based lookups)
 */
export function getResourcesFromCubes(cubes: number): Resources & { requiresCallback: boolean } {
  const workTime = getWorkTimeForCuft(cubes);

  if (workTime === null) {
    return { men: 0, vans: 0, workTime: 0, cuft: cubes, requiresCallback: true };
  }

  const vans = Math.ceil(cubes / 500);

  // Approximate men from cuft brackets
  let men = 2;
  if (cubes > 1500) men = 5;
  else if (cubes > 1000) men = 4;
  else if (cubes > 750) men = 3;

  return { men, vans, workTime, cuft: cubes, requiresCallback: false };
}

// ===================
// PRICING FUNCTIONS (v4.2)
// ===================

/**
 * Calculate crew cost based on hourly rate (v4.2)
 * £20/person/hour, capped at £200/person/day (10h max)
 */
export function getCrewCost(moverCount: number, hours: number): number {
  const { perPersonPerHour, maxDayRate } = CALCULATOR_CONFIG.crewRates;
  const perPerson = Math.min(hours * perPersonPerHour, maxDayRate);
  return moverCount * perPerson;
}

/**
 * Calculate mileage cost — flat rate (v4.2)
 * £0.43/mile, pass-through (no margin)
 */
export function getMileageCost(totalMiles: number): number {
  return totalMiles * CALCULATOR_CONFIG.mileageRate;
}

/**
 * Calculate accommodation cost
 * Triggered only when split-day Day 2 exceeds 10h
 */
export function getAccommodationCost(crewCount: number, nights: number): number {
  if (nights <= 0) return 0;

  const { perRoom, peoplePerRoom } = CALCULATOR_CONFIG.accommodation;
  const rooms = Math.ceil(crewCount / peoplePerRoom);
  return rooms * perRoom * nights;
}

// ===================
// COMPLICATIONS (v4.2 — Point System)
// ===================

/**
 * Apply complications using point system (v4.2)
 * Points translate to extra crew. Plants add resources directly.
 */
export function applyComplications(
  complications: Complication[]
): { extraCrew: number; extraVans: number; requiresSurvey: boolean; totalPoints: number } {
  let totalPoints = 0;
  let extraVans = 0;
  let extraMen = 0;

  for (const complication of complications) {
    const config = CALCULATOR_CONFIG.complications[complication];

    if ('points' in config) {
      totalPoints += config.points;
    }
    if ('addVans' in config) {
      extraVans += config.addVans;
    }
    if ('addMen' in config) {
      extraMen += config.addMen;
    }
  }

  // 6+ points → free survey required
  if (totalPoints >= CALCULATOR_CONFIG.complicationSurveyThreshold) {
    return { extraCrew: extraMen, extraVans, requiresSurvey: true, totalPoints };
  }

  // Look up extra crew from tiers
  let extraCrewFromPoints = 0;
  for (const tier of CALCULATOR_CONFIG.complicationCrewTiers) {
    if (totalPoints <= tier.maxPoints) {
      extraCrewFromPoints = tier.extraCrew;
      break;
    }
  }

  return {
    extraCrew: extraCrewFromPoints + extraMen,
    extraVans,
    requiresSurvey: false,
    totalPoints,
  };
}

// ===================
// BILLING RULES (v4.2)
// ===================

export interface BillingResult {
  billingType: BillingType;
  crewHours: number;
  vanRate: number;
  days: number;
  isHalfDay: boolean;
  warningZone: boolean;
  label: string;
}

/**
 * Determine billing based on total time, distance, and chain status (v4.2)
 */
export function calculateBilling(
  totalTime: number,
  oneWayMiles: number,
  isChain: boolean
): BillingResult {
  const rules = CALCULATOR_CONFIG.billingRules;
  const vanRates = CALCULATOR_CONFIG.vanRates;

  // ≤5h: half day (unless regional >10mi or chain → full day)
  if (totalTime <= rules.halfDayMaxHours) {
    const forceFullDay = isChain || oneWayMiles > rules.regionalFullDayMinMiles;

    if (forceFullDay) {
      return {
        billingType: 'fullDay',
        crewHours: rules.fullDayBillableHours,
        vanRate: vanRates.fullDay,
        days: 1,
        isHalfDay: false,
        warningZone: false,
        label: 'Full Day',
      };
    }

    return {
      billingType: 'halfDay',
      crewHours: Math.max(rules.halfDayMinBillableHours, totalTime),
      vanRate: vanRates.halfDay,
      days: 1,
      isHalfDay: true,
      warningZone: false,
      label: 'Half Day',
    };
  }

  // 5–8h: full day (bill 8h crew)
  if (totalTime <= rules.fullDayBillableHours) {
    return {
      billingType: 'fullDay',
      crewHours: rules.fullDayBillableHours,
      vanRate: vanRates.fullDay,
      days: 1,
      isHalfDay: false,
      warningZone: false,
      label: 'Full Day',
    };
  }

  // 8–10h: overtime (bill actual hours)
  if (totalTime <= rules.maxHoursPerDay) {
    return {
      billingType: 'overtime',
      crewHours: totalTime,
      vanRate: vanRates.fullDay,
      days: 1,
      isHalfDay: false,
      warningZone: false,
      label: 'Full Day',
    };
  }

  // 10–12h: warning zone (cap at 10h, show warning)
  if (totalTime <= rules.splitDayThreshold) {
    return {
      billingType: 'warningZone',
      crewHours: rules.maxHoursPerDay,
      vanRate: vanRates.fullDay,
      days: 1,
      isHalfDay: false,
      warningZone: true,
      label: 'Full Day',
    };
  }

  // >12h: split-day (placeholder — actual split calculation done separately)
  return {
    billingType: 'splitDay',
    crewHours: 0, // calculated per-day
    vanRate: 0,    // calculated per-day
    days: 0,       // calculated per-day
    isHalfDay: false,
    warningZone: false,
    label: 'Split Day',
  };
}

/**
 * Calculate billing for a single day (used within split-day logic)
 */
function getBillingForDay(hours: number): BillingResult {
  const rules = CALCULATOR_CONFIG.billingRules;
  const vanRates = CALCULATOR_CONFIG.vanRates;

  if (hours <= rules.halfDayMaxHours) {
    return {
      billingType: 'halfDay',
      crewHours: Math.max(rules.halfDayMinBillableHours, hours),
      vanRate: vanRates.halfDay,
      days: 1,
      isHalfDay: true,
      warningZone: false,
      label: 'Half Day',
    };
  }

  if (hours <= rules.fullDayBillableHours) {
    return {
      billingType: 'fullDay',
      crewHours: rules.fullDayBillableHours,
      vanRate: vanRates.fullDay,
      days: 1,
      isHalfDay: false,
      warningZone: false,
      label: 'Full Day',
    };
  }

  // 8–10h
  return {
    billingType: 'overtime',
    crewHours: Math.min(hours, rules.maxHoursPerDay),
    vanRate: vanRates.fullDay,
    days: 1,
    isHalfDay: false,
    warningZone: false,
    label: 'Full Day',
  };
}

/**
 * Calculate split-day breakdown (v4.2 — 65/35 split)
 */
export function calculateSplitDay(
  workTime: number,
  men: number,
  vans: number,
  distances: QuoteInput['distances'],
  forceThreeDay?: boolean
): {
  days: DayBreakdown[];
  totalCrewCost: number;
  totalVanCost: number;
  totalMileageCost: number;
  accommodationCost: number;
  hotelRequired: boolean;
} {
  const splitRules = CALCULATOR_CONFIG.billingRules.splitDay;
  const maxHoursPerDay = CALCULATOR_CONFIG.billingRules.maxHoursPerDay;

  // Only pay for a hotel if the destination is far enough from the depot
  // that the crew can't reasonably drive home to sleep.
  const needsAccommodation =
    distances.toToDepot > CALCULATOR_CONFIG.accommodation.minDistanceMiles;

  // Day 1: depot → origin → load → depot
  // Approximate origin round-trip drive time (we only have total driveTimeHours)
  // Use ratio of depot-to-from vs total distance
  const totalOneWayDistance = distances.depotToFrom + distances.fromToTo + distances.toToDepot;
  const depotToFromDriveHours = totalOneWayDistance > 0
    ? (distances.depotToFrom / totalOneWayDistance) * distances.driveTimeHours * 2
    : 0;

  const day1Hours = (workTime * splitRules.loadPercent) + splitRules.day1SetupHours + depotToFromDriveHours;
  const day1Miles = distances.depotToFrom * 2; // round trip

  // Day 2: depot → destination → unload → depot
  const toToDepotDriveHours = totalOneWayDistance > 0
    ? (distances.toToDepot / totalOneWayDistance) * distances.driveTimeHours * 2
    : 0;

  let day2Hours = toToDepotDriveHours + (workTime * splitRules.unloadPercent) + splitRules.day2SetupHours;
  let day2Miles = distances.toToDepot * 2; // round trip

  // Force 3-day hotel scenario for alternative quote display
  if (forceThreeDay) {
    day2Hours = maxHoursPerDay + 1; // sentinel: triggers hotel branch below
  }

  const days: DayBreakdown[] = [];
  let accommodationCost = 0;
  let hotelRequired = false;

  // Day 1 billing
  const day1Billing = getBillingForDay(day1Hours);
  const day1CrewCost = getCrewCost(men, day1Billing.crewHours);
  const day1VanCost = vans * day1Billing.vanRate;
  const day1MileageCost = getMileageCost(day1Miles);

  days.push({
    day: 1,
    label: 'Pack your home',
    hours: day1Hours,
    crewCost: day1CrewCost,
    vanCost: day1VanCost,
    mileageCost: day1MileageCost,
    billingType: day1Billing.billingType,
  });

  // Check if Day 2 exceeds 10h → Hotel scenario
  if (day2Hours > maxHoursPerDay) {
    hotelRequired = true;

    // Day 2 becomes: drive to destination + settling
    const oneWayDriveToDestHours = toToDepotDriveHours / 2;
    const day2HotelHours = oneWayDriveToDestHours + splitRules.hotelSettlingHours;
    const day2HotelMiles = distances.toToDepot; // one-way

    const day2Billing = getBillingForDay(day2HotelHours);
    const day2CrewCost = getCrewCost(men, day2Billing.crewHours);
    const day2VanCost = vans * day2Billing.vanRate;
    const day2MileageCost = getMileageCost(day2HotelMiles);

    days.push({
      day: 2,
      label: needsAccommodation
        ? 'Drive to destination (overnight stay)'
        : 'Drive to destination',
      hours: day2HotelHours,
      crewCost: day2CrewCost,
      vanCost: day2VanCost,
      mileageCost: day2MileageCost,
      billingType: day2Billing.billingType,
    });

    // Day 3: unload + return
    const day3Hours = (workTime * splitRules.unloadPercent) + oneWayDriveToDestHours + splitRules.day2SetupHours;
    const day3Miles = distances.toToDepot; // one-way return
    const day3Billing = getBillingForDay(day3Hours);
    const day3CrewCost = getCrewCost(men, day3Billing.crewHours);
    const day3VanCost = vans * day3Billing.vanRate;
    const day3MileageCost = getMileageCost(day3Miles);

    days.push({
      day: 3,
      label: 'Unpack at your new home',
      hours: day3Hours,
      crewCost: day3CrewCost,
      vanCost: day3VanCost,
      mileageCost: day3MileageCost,
      billingType: day3Billing.billingType,
    });

    // Accommodation — only if destination is too far to drive home
    accommodationCost = needsAccommodation ? getAccommodationCost(men, 1) : 0;

  } else {
    // Normal Day 2
    const day2Billing = getBillingForDay(day2Hours);
    const day2CrewCost = getCrewCost(men, day2Billing.crewHours);
    const day2VanCost = vans * day2Billing.vanRate;
    const day2MileageCost = getMileageCost(day2Miles);

    days.push({
      day: 2,
      label: 'Deliver & unpack at your new home',
      hours: day2Hours,
      crewCost: day2CrewCost,
      vanCost: day2VanCost,
      mileageCost: day2MileageCost,
      billingType: day2Billing.billingType,
    });

    // Crew only needs overnight accommodation if the destination is too
    // far from the depot to drive home; otherwise they sleep at home.
    accommodationCost = needsAccommodation ? getAccommodationCost(men, 1) : 0;
  }

  const totalCrewCost = days.reduce((sum, d) => sum + d.crewCost, 0);
  const totalVanCost = days.reduce((sum, d) => sum + d.vanCost, 0);
  const totalMileageCost = days.reduce((sum, d) => sum + d.mileageCost, 0);

  return {
    days,
    totalCrewCost,
    totalVanCost,
    totalMileageCost,
    accommodationCost,
    hotelRequired,
  };
}

// ===================
// MARGIN (v4.2 — Size-Adjusted)
// ===================

/**
 * Look up margin multiplier from the 5×3 matrix
 */
export function getMarginMultiplier(controllableSubtotal: number, oneWayMiles: number): number {
  const { distanceTiers, sizeBrackets, margins } = CALCULATOR_CONFIG.marginMatrix;

  // Find distance tier index
  let tierIdx = 0;
  for (let i = 0; i < distanceTiers.length; i++) {
    const tier = distanceTiers[i];
    if (tier && oneWayMiles <= tier.maxMiles) {
      tierIdx = i;
      break;
    }
  }

  // Find size bracket index
  let bracketIdx = 0;
  for (let i = 0; i < sizeBrackets.length; i++) {
    const bracket = sizeBrackets[i];
    if (bracket !== undefined && controllableSubtotal <= bracket) {
      bracketIdx = i;
      break;
    }
  }

  const tierMargins = margins[tierIdx];
  return tierMargins ? (tierMargins[bracketIdx] ?? 1.50) : 1.50;
}

// ===================
// SURCHARGES (v4.2)
// ===================

/**
 * Check if a date is a bank holiday
 */
export function isBankHoliday(dateStr: string): boolean {
  return (CALCULATOR_CONFIG.bankHolidays as readonly string[]).includes(dateStr);
}

/**
 * Check if a date is Saturday
 */
export function isSaturday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  return date.getDay() === 6;
}

/**
 * Get surcharge type and rate for a given date
 */
export function getSurchargeInfo(selectedDate?: string): { type: SurchargeType; rate: number } {
  if (!selectedDate) return { type: null, rate: 0 };

  if (isBankHoliday(selectedDate)) {
    return { type: 'bankHoliday', rate: CALCULATOR_CONFIG.surcharges.bankHoliday };
  }

  if (isSaturday(selectedDate)) {
    return { type: 'saturday', rate: CALCULATOR_CONFIG.surcharges.saturday };
  }

  return { type: null, rate: 0 };
}

// ===================
// EXTRAS
// ===================

/**
 * Calculate extras cost (pass-through, no margin)
 */
export function getExtrasCost(extras: QuoteInput['extras'], cubes: number): number {
  let total = 0;

  // New packing tier system
  if ('packingTier' in extras && extras.packingTier) {
    const sizeCategory = getPackingSizeCategory(cubes);
    const tierConfig = CALCULATOR_CONFIG.packingTiers[extras.packingTier as keyof typeof CALCULATOR_CONFIG.packingTiers];
    if (tierConfig && tierConfig.priceBySize) {
      total += tierConfig.priceBySize[sizeCategory];
    }
  }
  // Legacy packing support
  else if (extras.packing) {
    total += CALCULATOR_CONFIG.packing[extras.packing].total;
  }

  // Cleaning
  if ('cleaningRooms' in extras && extras.cleaningRooms && extras.cleaningRooms > 0) {
    const roomKey = Math.max(1, Math.min(extras.cleaningRooms, 6)) as 1 | 2 | 3 | 4 | 5 | 6;
    const basePrice = CALCULATOR_CONFIG.cleaning[roomKey]?.price ?? 90;
    const cleaningType = ('cleaningType' in extras ? extras.cleaningType : 'quick') as keyof typeof CALCULATOR_CONFIG.cleaningTiers;
    const multiplier = CALCULATOR_CONFIG.cleaningTiers[cleaningType]?.multiplier || 1.0;
    total += Math.round(basePrice * multiplier);
  }

  // Storage with duration
  if ('storageSize' in extras && extras.storageSize && 'storageWeeks' in extras && extras.storageWeeks) {
    const sizeConfig = CALCULATOR_CONFIG.storageSizes[extras.storageSize as keyof typeof CALCULATOR_CONFIG.storageSizes];
    if (sizeConfig) {
      const weeklyRate = sizeConfig.price;
      const weeks = extras.storageWeeks as number;
      const discountedWeeks = Math.min(weeks, 8);
      const fullPriceWeeks = Math.max(0, weeks - 8);
      total += (discountedWeeks * weeklyRate * 0.5) + (fullPriceWeeks * weeklyRate);
    }
  }
  // Legacy storage support
  else if (extras.storage) {
    total += CALCULATOR_CONFIG.storage[extras.storage].price;
  }

  // Disassembly items
  if ('disassemblyItems' in extras && extras.disassemblyItems && Array.isArray(extras.disassemblyItems)) {
    for (const item of extras.disassemblyItems as Array<{ category: keyof typeof CALCULATOR_CONFIG.assembly; quantity: number }>) {
      total += CALCULATOR_CONFIG.assembly[item.category].price * item.quantity;
    }
  }
  // Legacy assembly support
  else if (extras.assembly && extras.assembly.length > 0) {
    for (const item of extras.assembly) {
      total += CALCULATOR_CONFIG.assembly[item.type].price * item.quantity;
    }
  }

  return total;
}

/**
 * Get recommended packing size based on cubes
 */
export function getRecommendedPackingSize(cubes: number): PackingSize {
  const { packing } = CALCULATOR_CONFIG;
  if (cubes <= packing.small.cubesMax) return 'small';
  if (cubes <= packing.medium.cubesMax) return 'medium';
  if (cubes <= packing.large.cubesMax) return 'large';
  return 'xl';
}

/**
 * Round price to nearest £10
 */
export function roundPrice(price: number): number {
  return Math.round(price / 10) * 10;
}

// ===================
// MAIN CALCULATION (v4.2)
// ===================

/**
 * Calculate full quote using v4.2 pricing model
 */
export function calculateQuote(input: QuoteInput): QuoteResult {
  let cubes = 0;
  let men = 0;
  let vans = 0;
  let workTime = 0;
  let requiresCallback = false;
  let callbackReason: string | undefined;

  // ===================
  // 1. GET RESOURCES
  // ===================

  if (input.serviceType === 'office' && input.officeSize) {
    cubes = getCubesForOffice(input.officeSize);
    const result = getResourcesFromCubes(cubes);
    men = result.men;
    vans = result.vans;
    workTime = result.workTime;
    requiresCallback = result.requiresCallback;

  } else if (input.furnitureOnly) {
    const result = getResourcesForFurnitureOnly(input.furnitureOnly);
    men = result.men;
    vans = result.vans;
    workTime = result.workTime;
    requiresCallback = result.requiresCallback;
    if (requiresCallback) callbackReason = 'specialist_items';

  } else if (input.propertySize && input.sliderPosition) {
    const result = getResourcesForProperty(input.propertySize, input.sliderPosition);
    men = result.men;
    vans = result.vans;
    workTime = result.workTime;
    cubes = result.cuft;
    requiresCallback = result.requiresCallback;
    callbackReason = result.callbackReason;

  } else {
    throw new Error('Invalid input: missing property size, office size, or furniture details');
  }

  // ===================
  // 2. APPLY MANUAL OVERRIDE
  // ===================

  if (input.manualOverride) {
    men = input.manualOverride.men;
    vans = input.manualOverride.vans;
  }

  // ===================
  // 3. APPLY COMPLICATIONS (point system)
  // ===================

  const complicationResult = applyComplications(input.complications);
  men += complicationResult.extraCrew;
  vans += complicationResult.extraVans;

  if (complicationResult.requiresSurvey) {
    requiresCallback = true;
    callbackReason = 'complication_survey';
  }

  // Ensure minimum 2 men
  men = Math.max(2, men);

  // ===================
  // 4. CALCULATE TIME & BILLING
  // ===================

  const totalMiles = input.distances.depotToFrom + input.distances.fromToTo + input.distances.toToDepot;
  const oneWayMiles = input.distances.fromToTo;
  const totalJobTime = workTime + input.distances.driveTimeHours;

  let billing = calculateBilling(totalJobTime, oneWayMiles, input.propertyChain);

  // Override billing type if forceBilling is set (for alternative quote display)
  if (input.forceBilling === 'singleDay' && billing.billingType === 'splitDay') {
    // Force single-day: use warningZone-style billing (cap at 10h crew)
    const rules = CALCULATOR_CONFIG.billingRules;
    billing = {
      billingType: 'warningZone',
      crewHours: rules.maxHoursPerDay,
      vanRate: CALCULATOR_CONFIG.vanRates.fullDay,
      days: 1,
      isHalfDay: false,
      warningZone: true,
      label: 'Full Day',
    };
  } else if (input.forceBilling === 'splitDay') {
    // Force split-day: override to splitDay billing (guard removed — enables 3-day → 2-day)
    billing = {
      billingType: 'splitDay',
      crewHours: 0,
      vanRate: 0,
      days: 0,
      isHalfDay: false,
      warningZone: false,
      label: 'Split Day',
    };
  } else if (input.forceBilling === 'threeDay') {
    // Force three-day: same sentinel, forceThreeDay flag passed to calculateSplitDay
    billing = {
      billingType: 'splitDay',
      crewHours: 0,
      vanRate: 0,
      days: 0,
      isHalfDay: false,
      warningZone: false,
      label: 'Split Day',
    };
  }

  // ===================
  // 5. CALCULATE COSTS
  // ===================

  let crewCost: number;
  let vansCost: number;
  let mileageCost: number;
  let accommodationCost = 0;
  let splitDayBreakdown: DayBreakdown[] | undefined;
  let serviceDays: number;

  if (billing.billingType === 'splitDay') {
    // Split-day calculation
    const splitResult = calculateSplitDay(workTime, men, vans, input.distances, input.forceBilling === 'threeDay' || totalJobTime > 20);
    crewCost = splitResult.totalCrewCost;
    vansCost = splitResult.totalVanCost;
    mileageCost = splitResult.totalMileageCost;
    accommodationCost = splitResult.accommodationCost;
    splitDayBreakdown = splitResult.days;
    serviceDays = splitResult.days.length;
  } else {
    // Single-day calculation
    crewCost = getCrewCost(men, billing.crewHours);
    vansCost = vans * billing.vanRate;
    mileageCost = getMileageCost(totalMiles);
    serviceDays = 1;
  }

  // ===================
  // 6. SURCHARGE (Saturday/Bank Holiday)
  // ===================

  const surchargeInfo = getSurchargeInfo(input.selectedDate);
  const surchargeCost = crewCost * surchargeInfo.rate;
  const surcharge = surchargeInfo.type
    ? { type: surchargeInfo.type, amount: surchargeCost }
    : null;

  // ===================
  // 7. KEY WAIT WAIVER
  // ===================

  const keyWaitWaiverCost = input.keyWaitWaiver
    ? men * CALCULATOR_CONFIG.keyWaitWaiver.ratePerMover
    : 0;

  // ===================
  // 8. EXTRAS (pass-through)
  // ===================

  const extrasCost = getExtrasCost(input.extras, cubes);

  // ===================
  // 9. MARGIN CALCULATION (v4.2)
  // ===================

  // Controllable costs = crew + van + surcharge on crew
  const controllableCost = crewCost + vansCost + surchargeCost;

  // Margin applied ONLY to controllables
  const marginMultiplier = getMarginMultiplier(controllableCost, oneWayMiles);
  const marginedTotal = controllableCost * marginMultiplier;

  // Pass-through costs = mileage + accommodation + key wait + extras (NO margin)
  const passThroughCost = mileageCost + accommodationCost + keyWaitWaiverCost + extrasCost;

  // ===================
  // 10. FINAL PRICE
  // ===================

  const totalPrice = roundPrice(marginedTotal + passThroughCost);

  // ===================
  // 11. SERVICE DURATION LABEL
  // ===================

  let serviceDuration: string;
  if (billing.billingType === 'splitDay' && splitDayBreakdown) {
    serviceDuration = `${splitDayBreakdown.length} Days`;
  } else {
    serviceDuration = billing.label;
  }

  // ===================
  // 12. RETURN RESULT
  // ===================

  const result: QuoteResult = {
    totalPrice,
    men,
    vans,
    cubes,
    workTime,
    totalJobTime,
    serviceDuration,
    serviceDays,
    isHalfDay: billing.isHalfDay,
    billingType: billing.billingType,
    warningZone: billing.warningZone,
    requiresCallback,
    showMultiDayWarning: billing.warningZone,
    surcharge,
    breakdown: {
      crewCost,
      vansCost,
      controllableCost,
      surchargeCost,
      marginMultiplier,
      marginedTotal,
      // Visible Service & Insurance line — the difference between the
      // margined controllable total and the raw controllable subtotal.
      // Exposed so admin emails can show where the gap between the
      // breakdown lines and the total price is coming from.
      margin: marginedTotal - controllableCost,
      mileageCost,
      accommodationCost,
      keyWaitWaiverCost,
      extrasCost,
      passThroughCost,
      complicationExtraCrew: complicationResult.extraCrew,
    },

    // Legacy compatibility
    loadTime: workTime,
    moversCost: crewCost,
  };

  if (callbackReason) result.callbackReason = callbackReason;
  if (splitDayBreakdown) result.splitDayBreakdown = splitDayBreakdown;

  return result;
}

// ===================
// HOUSE CLEARANCE
// ===================

export type DisposalItemType = keyof typeof CALCULATOR_CONFIG.houseClearance.disposal;
export type AccessDifficulty = keyof typeof CALCULATOR_CONFIG.houseClearance.accessDifficulties;

export interface HouseClearanceInput {
  disposalItems: Array<{
    type: DisposalItemType;
    quantity: number;
  }>;
  accessDifficulties: AccessDifficulty[];
  distances: {
    depotToFrom: number;
    fromToTo: number;
    toToDepot: number;
    driveTimeHours: number;
  };
}

export interface HouseClearanceResult {
  totalPrice: number;
  breakdown: {
    disposalCost: number;
    mileageCost: number;
    accessDifficultyPercentage: number;
    subtotal: number;
  };
}

/**
 * Calculate house clearance quote
 */
export function calculateHouseClearance(input: HouseClearanceInput): HouseClearanceResult {
  // 1. Disposal fees
  let disposalCost = 0;
  for (const item of input.disposalItems) {
    const config = CALCULATOR_CONFIG.houseClearance.disposal[item.type];
    disposalCost += config.price * item.quantity;
  }

  // 2. Mileage (flat rate, pass-through)
  const totalMiles = input.distances.depotToFrom + input.distances.fromToTo + input.distances.toToDepot;
  const mileageCost = getMileageCost(totalMiles);

  // 3. Access difficulty surcharge
  let accessDifficultyPercentage = 0;
  for (const difficulty of input.accessDifficulties) {
    accessDifficultyPercentage += CALCULATOR_CONFIG.houseClearance.accessDifficulties[difficulty].percentage;
  }

  // 4. Subtotal with access surcharge
  const subtotal = (disposalCost + mileageCost) * (1 + accessDifficultyPercentage);

  // 5. Apply margin
  const oneWayMiles = input.distances.fromToTo;
  const marginMultiplier = getMarginMultiplier(disposalCost, oneWayMiles);
  const totalPrice = roundPrice(subtotal * marginMultiplier);

  return {
    totalPrice,
    breakdown: {
      disposalCost,
      mileageCost,
      accessDifficultyPercentage,
      subtotal,
    },
  };
}

// ===================
// VALIDATION
// ===================

export function validateVanCrew(
  vans: number,
  crew: number
): { valid: boolean; message?: string } {
  const { minVansPerCrew, maxCrewPerVan } = CALCULATOR_CONFIG.validation;
  const minCrew = vans * minVansPerCrew;
  const maxCrew = vans * maxCrewPerVan;

  if (crew < minCrew) {
    return {
      valid: false,
      message: `You need at least ${minCrew} mover${minCrew > 1 ? 's' : ''} for ${vans} van${vans > 1 ? 's' : ''} - each van needs a driver.`
    };
  }

  if (crew > maxCrew) {
    return {
      valid: false,
      message: `Maximum ${maxCrew} movers for ${vans} van${vans > 1 ? 's' : ''} - each van holds up to 3 people.`
    };
  }

  return { valid: true };
}

export function checkRecommendationDiff(
  recommended: Resources,
  manual: { men: number; vans: number }
): { differs: boolean; message?: string } {
  if (recommended.men === manual.men && recommended.vans === manual.vans) {
    return { differs: false };
  }

  return {
    differs: true,
    message: `Based on your property, we'd typically recommend ${recommended.vans} van${recommended.vans > 1 ? 's' : ''} and ${recommended.men} mover${recommended.men > 1 ? 's' : ''}. You've selected ${manual.vans} van${manual.vans > 1 ? 's' : ''} and ${manual.men} mover${manual.men > 1 ? 's' : ''}.`,
  };
}

// ===================
// LEGACY COMPATIBILITY
// ===================

/** @deprecated Use getResourcesForProperty or getResourcesFromCubes instead */
export function getCubesForProperty(
  propertySize: PropertySize,
  sliderPosition: SliderPosition
): number {
  return getModifiedCuft(propertySize, sliderPosition);
}

/** @deprecated Use getCrewCost instead */
export function getMoverDayCost(moverCount: number): number {
  return getCrewCost(moverCount, CALCULATOR_CONFIG.crewRates.maxHoursPerDay);
}

/** @deprecated Use calculateBilling instead */
export function getServiceDuration(
  totalJobTime: number,
  propertyChain: boolean
): { days: number; isHalfDay: boolean; label: string } {
  const billing = calculateBilling(totalJobTime, 0, propertyChain);
  return {
    days: billing.days || 1,
    isHalfDay: billing.isHalfDay,
    label: billing.label,
  };
}
