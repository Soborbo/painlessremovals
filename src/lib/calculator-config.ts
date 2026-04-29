/**
 * PAINLESS REMOVALS - CALCULATOR CONFIGURATION v4.2
 *
 * All pricing tables, thresholds, and constants.
 * This file contains DATA ONLY - no calculation logic.
 *
 * v4.2 changes: Hourly crew rates, flat mileage, size-adjusted margins,
 * point-based complications, 65/35 split-day, weekend/bank holiday surcharges.
 */

export const CALCULATOR_CONFIG = {
  // Company info
  company: {
    name: 'Painless Removals Bristol',
    depot: 'BS10 5PN',
    phone: '0117 28 700 82',
    email: 'quotes@painlessremovals.com',
  },

  // Currency & formatting
  currency: {
    code: 'GBP',
    symbol: '£',
    locale: 'en-GB',
  },

  // ===================
  // MARGIN — Size-adjusted (v4.2)
  // ===================
  // Applied ONLY to controllable costs (crew + van).
  // Pass-throughs (mileage, accommodation, packing, cleaning, storage, assembly, clearance, key wait) get NO margin.
  marginMatrix: {
    distanceTiers: [
      { name: 'local' as const, maxMiles: 10 },
      { name: 'regional' as const, maxMiles: 50 },
      { name: 'longDistance' as const, maxMiles: Infinity },
    ],
    // Upper bounds for controllable subtotal brackets
    sizeBrackets: [300, 600, 1000, 1500, Infinity],
    // margins[distanceTierIndex][sizeBracketIndex]
    margins: [
      [1.75, 1.65, 1.57, 1.53, 1.47], // local (≤10mi)
      [1.70, 1.60, 1.52, 1.48, 1.42], // regional (10–50mi)
      [1.65, 1.55, 1.47, 1.43, 1.37], // longDistance (50+mi)
    ],
  },

  // ===================
  // PROPERTY → RESOURCES (v4.2)
  // ===================
  // Base cuft, base men, and work time per property size.
  // Slider modifier is applied to baseCuft; men/vans/workTime derived from modified cuft.
  propertyResources: {
    'studio':     { baseCuft: 300,  baseMen: 2, workTime: 1.5 },
    '1bed':       { baseCuft: 300,  baseMen: 2, workTime: 1.5 },
    '2bed':       { baseCuft: 750,  baseMen: 2, workTime: 4.0 },
    '3bed-small': { baseCuft: 1000, baseMen: 3, workTime: 5.0 },
    '3bed-large': { baseCuft: 1250, baseMen: 4, workTime: 6.0 },
    '4bed':       { baseCuft: 1750, baseMen: 4, workTime: 7.5 },
    '5bed':       { baseCuft: 2000, baseMen: 5, workTime: 8.0 },
    '5bed-plus':  null, // Free survey required
  } as Record<string, { baseCuft: number; baseMen: number; workTime: number } | null>,

  // ===================
  // CUFT BRACKET BOUNDARIES (v4.2)
  // ===================
  // When slider pushes cuft between base values, use these for work time lookup.
  cuftBrackets: [
    { maxCuft: 300,  workTime: 1.5 },
    { maxCuft: 500,  workTime: 2.5 },
    { maxCuft: 750,  workTime: 4.0 },
    { maxCuft: 1000, workTime: 5.0 },
    { maxCuft: 1250, workTime: 6.0 },
    { maxCuft: 1500, workTime: 6.5 },
    { maxCuft: 1750, workTime: 7.5 },
    { maxCuft: 2000, workTime: 8.0 },
    { maxCuft: 2250, workTime: 8.5 },
    // 2251+ → free survey required
  ],

  // ===================
  // SLIDER → MODIFIER (v4.2)
  // ===================
  // Direct cuft multiplier applied to base cuft.
  // Men: +1 per started 250 cuft increase, -1 per full 250 cuft decrease (min 2).
  // Vans: ceil(modifiedCuft / 500).
  sliderModifiers: {
    1: { multiplier: 0.80, label: 'Minimalist' },
    2: { multiplier: 0.90, label: 'Light' },
    3: { multiplier: 1.00, label: 'Average' },
    4: { multiplier: 1.10, label: 'Full' },
    5: { multiplier: 1.20, label: 'Packed' },
  } as Record<number, { multiplier: number; label: string }>,

  // ===================
  // OFFICE → CUBES
  // ===================
  officeCubes: {
    'small':  { cubes: 500, description: '1-5 desks' },
    'medium': { cubes: 1000, description: '6-15 desks' },
    'large':  { cubes: 1500, description: '16+ desks' },
  } as Record<string, { cubes: number; description: string }>,

  // ===================
  // FURNITURE ONLY
  // ===================
  furnitureOnly: {
    loadTimeByItems: {
      5: 1,    // 1-5 items = 1 hour
      7: 1.5,  // 6-7 items = 1.5 hours
      10: 2,   // 8-10 items = 2 hours
      999: 2.5 // 10+ items = 2.5 hours
    } as Record<number, number>,
    heavyWeightThreshold: 40,
    specialistItems: [
      'piano',
      'safe',
      'gym-equipment',
      'hot-tub',
      'marble-stone',
      'other'
    ],
  },

  // ===================
  // PRICING - VANS (v4.2)
  // ===================
  vanRates: {
    halfDay: 55,  // £55 per van for ≤5h (was £50 in v4.1)
    fullDay: 100, // £100 per van per day
  },

  // ===================
  // PRICING - CREW (v4.2)
  // ===================
  // Replaces old moverRates (tiered per-person day rate)
  crewRates: {
    perPersonPerHour: 20, // £20/person/hour flat
    maxHoursPerDay: 10,   // 10h cap per person per day
    maxDayRate: 200,      // £200 max per person per day (10h × £20)
  },

  // ===================
  // PRICING - MILEAGE (v4.2)
  // ===================
  // Flat rate, pass-through (no margin). Replaces tiered mileageRates.
  mileageRate: 0.43, // £0.43/mile

  // ===================
  // PRICING - ACCOMMODATION
  // ===================
  // Split-day overnight accommodation for the crew. Only charged when the
  // destination is far enough from the depot that driving home is not
  // practical — closer than `minDistanceMiles` the crew sleeps at home and
  // the quote carries no accommodation line.
  // Pass-through cost — no margin applied.
  accommodation: {
    perRoom: 140,         // £140 per room per night
    peoplePerRoom: 2,     // 2 people per room
    minDistanceMiles: 50, // destination→depot mileage below which no hotel is booked
  },

  // ===================
  // BILLING RULES (v4.2)
  // ===================
  billingRules: {
    halfDayMaxHours: 5,         // ≤5h = half day
    halfDayMinBillableHours: 4, // min 4h crew billing for half day jobs
    fullDayBillableHours: 8,    // 5–8h → bill 8h crew
    maxHoursPerDay: 10,         // 10h cap per person per day
    warningZone: { min: 10, max: 12 }, // 10–12h: single day + warning
    splitDayThreshold: 12,      // >12h → split-day
    regionalFullDayMinMiles: 10, // one-way >10mi AND total ≤5h → full day billing
    splitDay: {
      loadPercent: 0.65,        // 65% of work time is loading (Day 1)
      unloadPercent: 0.35,      // 35% of work time is unloading (Day 2)
      day1SetupHours: 0.4,      // depot overhead for Day 1
      day2SetupHours: 0.2,      // setup for Day 2
      hotelSettlingHours: 0.5,  // settling time if hotel required
    },
  },

  // ===================
  // SURCHARGES (v4.2 — NEW)
  // ===================
  // Applied to crew cost only.
  surcharges: {
    saturday: 0.25,    // +25% on crew cost
    bankHoliday: 0.35, // +35% on crew cost
  },

  // England & Wales bank holidays. Extended through 2030 — the
  // surcharge logic returns false (no surcharge) for any date not in
  // this list, so undershooting the calendar silently undercharges
  // bank-holiday moves. Source: gov.uk/bank-holidays.
  bankHolidays: [
    // 2026
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04',
    '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
    // 2027
    '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03',
    '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
    // 2028
    '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01',
    '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
    // 2029
    '2029-01-01', '2029-03-30', '2029-04-02', '2029-05-07',
    '2029-05-28', '2029-08-27', '2029-12-25', '2029-12-26',
    // 2030
    '2030-01-01', '2030-04-19', '2030-04-22', '2030-05-06',
    '2030-05-27', '2030-08-26', '2030-12-25', '2030-12-26',
  ],

  // ===================
  // COMPLICATIONS — Point System (v4.2)
  // ===================
  // Each complication has a point value. Points translate to extra crew on a tiered scale.
  // Plants (20+) add resources directly, separate from the point system.
  complications: {
    stairs2ndNoLift:  { points: 2, label: 'Stairs (2nd+ floor, no lift)' },
    restrictedAccess: { points: 2, label: 'Restricted access' },
    narrowDoors:      { points: 1, label: 'Narrow doors/hallways' },
    noLift:           { points: 1, label: 'No lift available' },
    heavyItems:       { points: 1, label: 'Heavy/oversize items' },
    plants:           { addVans: 1, addMen: 1, label: 'Large plant collection (20+)' },
  },

  // Points → extra crew tiers
  complicationCrewTiers: [
    { maxPoints: 1, extraCrew: 0 },
    { maxPoints: 3, extraCrew: 1 },
    { maxPoints: 5, extraCrew: 2 },
    // 6+ → free survey required
  ],
  complicationSurveyThreshold: 6,

  // ===================
  // PACKING SERVICES
  // ===================
  packing: {
    fragileOnly: {
      cubesMin: 0,
      cubesMax: Infinity,
      work: 250,
      materials: 185,
      total: 435,
      label: 'Fragile items only'
    },
    small: {
      cubesMin: 0,
      cubesMax: 750,
      work: 280,
      materials: 120,
      total: 400,
      label: 'Small (up to 750 cu ft)'
    },
    medium: {
      cubesMin: 751,
      cubesMax: 1350,
      work: 420,
      materials: 160,
      total: 580,
      label: 'Medium (751-1350 cu ft)'
    },
    large: {
      cubesMin: 1351,
      cubesMax: 2000,
      work: 540,
      materials: 185,
      total: 725,
      label: 'Large (1351-2000 cu ft)'
    },
    xl: {
      cubesMin: 2001,
      cubesMax: Infinity,
      work: 720,
      materials: 270,
      total: 990,
      label: 'XL (2000+ cu ft)'
    },
  },

  // ===================
  // PACKING TIERS
  // ===================
  packingTiers: {
    materials: {
      label: 'Materials Only',
      description: 'Box and packing material rental only',
      image: 'moving-materials.jpg',
      priceBySize: {
        small: 85,
        medium: 120,
        large: 165,
        xl: 220,
      },
      includes: [
        'Selection of moving boxes',
        'Bubble wrap & packing paper',
        'Tape & labels',
        'Wardrobe boxes',
      ],
    },
    fragile: {
      label: 'Fragile Items',
      description: 'Professional packing for fragile items only',
      image: 'home-packing.jpg',
      priceBySize: {
        small: 285,
        medium: 365,
        large: 435,
        xl: 520,
      },
      includes: [
        'Kitchen accessories & glassware',
        'Mirrors & artwork',
        'Electronics & TVs',
        'Premium packing materials',
      ],
    },
    fullService: {
      label: 'Full Service',
      description: 'Complete professional packing service',
      image: 'home-packing-service.jpg',
      badge: 'Most Popular',
      priceBySize: {
        small: 400,
        medium: 580,
        large: 725,
        xl: 990,
      },
      includes: [
        'Full home packing service',
        'All furniture protected',
        'Every item carefully wrapped',
        'Stress-free experience',
      ],
    },
  },

  // ===================
  // CLEANING TIERS
  // ===================
  cleaningTiers: {
    quick: {
      label: 'Quick Clean',
      description: 'Standard move-out cleaning',
      multiplier: 1.0,
    },
    deep: {
      label: 'Deep Clean',
      description: 'Thorough end-of-tenancy cleaning',
      multiplier: 1.6,
      badge: 'Recommended',
    },
  },

  // ===================
  // STORAGE DURATIONS
  // ===================
  storageDurations: [
    { value: 1, label: '1 week', weeks: 1 },
    { value: 4, label: '1 month', weeks: 4 },
    { value: 8, label: '2 months', weeks: 8, badge: '50% off first 2 months!' },
    { value: 12, label: '3 months', weeks: 12 },
    { value: 26, label: '6 months', weeks: 26 },
    { value: 52, label: '1 year', weeks: 52 },
    { value: 'other', label: "Other / I don't know", weeks: 4 },
  ],

  // ===================
  // STORAGE SIZES
  // ===================
  storageSizes: {
    smallWardrobe: {
      price: 41,
      label: 'Small Wardrobe',
      sqft: 25,
      description: 'Perfect for a few boxes and small items',
      image: '25.png',
      fits: ['10-20 boxes', 'Small furniture items', 'Seasonal items'],
    },
    gardenShed: {
      price: 59,
      label: 'Garden Shed',
      sqft: 50,
      description: 'Great for studio or 1-bed contents',
      image: '50.png',
      fits: ['Small sofa', '30-40 boxes', 'Appliances'],
    },
    smallBedroom: {
      price: 82,
      label: 'Small Bedroom',
      sqft: 85,
      description: 'Ideal for 1-2 bedroom home contents',
      image: '85.png',
      fits: ['Bed frame & mattress', '50+ boxes', 'Living room furniture'],
    },
    standardBedroom: {
      price: 92,
      label: 'Standard Bedroom',
      sqft: 100,
      description: 'Most popular for 2-3 bed homes',
      image: '100.png',
      fits: ['2-3 rooms of furniture', 'Large sofa', 'Full bedroom suite'],
      badge: 'Most Popular',
    },
    largeBedroom: {
      price: 124,
      label: 'Large Bedroom',
      sqft: 150,
      description: 'Great for larger homes',
      image: '150.png',
      fits: ['3-4 rooms of furniture', 'Multiple beds', 'Dining sets'],
    },
    oneCarGarage: {
      price: 157,
      label: '1 Car Garage',
      sqft: 250,
      description: 'For complete house contents',
      image: '250.png',
      fits: ['4-5 bed house contents', 'Garden furniture', 'Workshop items'],
    },
  },

  // ===================
  // CLEANING SERVICES
  // ===================
  cleaning: {
    1: { price: 90, label: '1 room' },
    2: { price: 105, label: '2 rooms' },
    3: { price: 120, label: '3 rooms' },
    4: { price: 155, label: '4 rooms' },
    5: { price: 186, label: '5 rooms' },
    6: { price: 210, label: '6+ rooms' },
  } as Record<number, { price: number; label: string }>,

  // ===================
  // STORAGE SERVICES
  // ===================
  storage: {
    smallWardrobe: { price: 41, label: 'Small Wardrobe' },
    gardenShed: { price: 59, label: 'Garden Shed' },
    smallBedroom: { price: 82, label: 'Small Bedroom' },
    standardBedroom: { price: 92, label: 'Standard Bedroom' },
    largeBedroom: { price: 124, label: 'Large Bedroom' },
    oneCarGarage: { price: 157, label: 'One Car Garage' },
  },

  // ===================
  // FURNITURE ASSEMBLY
  // ===================
  assembly: {
    verySimple: { price: 20, label: 'Very Simple', examples: 'Tables, simple chairs' },
    simple: { price: 30, label: 'Simple', examples: 'Frame beds, bookshelves' },
    general: { price: 60, label: 'General', examples: 'Ottoman beds, double wardrobes' },
    complex: { price: 90, label: 'Complex', examples: 'Sliding door wardrobes' },
    veryComplex: { price: 120, label: 'Very Complex', examples: 'Gym equipment, custom' },
  },

  // ===================
  // PROPERTY SIZE OPTIONS
  // ===================
  propertySizeOptions: [
    { value: 'furniture', label: 'Furniture Only', icon: '🪑' },
    { value: 'studio', label: 'Studio', icon: '🏠' },
    { value: '1bed', label: '1 Bedroom', icon: '🏠' },
    { value: '2bed', label: '2 Bedrooms', icon: '🏠' },
    { value: '3bed-small', label: '3 Bedrooms (Small)', icon: '🏡' },
    { value: '3bed-large', label: '3 Bedrooms (Large)', icon: '🏡' },
    { value: '4bed', label: '4 Bedrooms', icon: '🏡' },
    { value: '5bed', label: '5 Bedrooms', icon: '🏘️' },
    { value: '5bed-plus', label: '5+ Bedrooms', icon: '🏰' },
  ],

  // ===================
  // PROGRESS MESSAGES
  // ===================
  progressMessages: {
    1: "📦 Let's figure out what you need...",
    2: "📦 Let's figure out what you need...",
    3: "🏠 Great! Now let's plan the details...",
    4: "🏠 Great! Now let's plan the details...",
    5: "🎉 Halfway there! Just a few more details...",
    6: "🎉 Halfway there! Just a few more details...",
    7: "🚚 Almost done! We're mapping your route...",
    8: "🚚 Almost done! We're mapping your route...",
    9: "🔑 Almost done! Just a few final details...",
    10: "🚀 Nearly there! Just your contact details...",
    11: "🚀 Nearly there! Just your contact details...",
    12: "🎉 Your quote is ready!",
  } as Record<number, string>,

  // ===================
  // HOUSE CLEARANCE
  // ===================
  houseClearance: {
    disposal: {
      gardenWaste: { price: 40, label: 'Garden waste (per ton bag)' },
      mixedWaste: { price: 60, label: 'Mixed non-recyclables (per ton bag)' },
      mattress: { price: 40, label: 'Mattress' },
      washingMachine: { price: 40, label: 'Washing machine' },
      sofa: { price: 80, label: 'Sofa' },
      bedSet: { price: 80, label: 'Bed + mattress set' },
      fridge: { price: 110, label: 'Fridge' },
      largeAppliance: { price: 110, label: 'Large appliance' },
      fullRoom: { price: 400, label: 'Full room clearance' },
    },
    accessDifficulties: {
      restrictedParking: { percentage: 0.20, label: 'Restricted parking' },
      upperFloorNoLift: { percentage: 0.30, label: 'Upper floor, no lift' },
      narrowDoors: { percentage: 0.10, label: 'Narrow doors' },
      atticOrBasement: { percentage: 0.30, label: 'Attic or basement' },
    },
  },

  // ===================
  // KEY WAIT WAIVER
  // ===================
  // Pass-through, no margin applied.
  keyWaitWaiver: {
    ratePerMover: 40, // £40 per mover
  },

  // ===================
  // VALIDATION
  // ===================
  validation: {
    minVansPerCrew: 1,
    maxCrewPerVan: 3,
    quoteValidDays: 30,
  },

  // ===================
  // THRESHOLDS
  // ===================
  thresholds: {
    callbackRequired: 2250, // Cubes above which callback is recommended (v4.2: 2251+ = survey)
    multiDayWarning: 10,    // Hours above which warning shown (v4.2: 10-12h zone)
  },

} as const;

// Type exports
export type PropertySize = keyof typeof CALCULATOR_CONFIG.propertyResources | 'furniture';
export type OfficeSize = keyof typeof CALCULATOR_CONFIG.officeCubes;
export type SliderPosition = 1 | 2 | 3 | 4 | 5;
export type PackingSize = keyof typeof CALCULATOR_CONFIG.packing;
export type PackingTierType = keyof typeof CALCULATOR_CONFIG.packingTiers;
export type PackingSizeCategory = 'small' | 'medium' | 'large' | 'xl';
export type CleaningTierType = keyof typeof CALCULATOR_CONFIG.cleaningTiers;
export type StorageSize = keyof typeof CALCULATOR_CONFIG.storage;
export type StorageSizeKey = keyof typeof CALCULATOR_CONFIG.storageSizes;
export type AssemblyComplexity = keyof typeof CALCULATOR_CONFIG.assembly;
export type Complication = keyof typeof CALCULATOR_CONFIG.complications;
export type DistanceTier = 'local' | 'regional' | 'longDistance';
export type DisposalItemType = keyof typeof CALCULATOR_CONFIG.houseClearance.disposal;
export type AccessDifficulty = keyof typeof CALCULATOR_CONFIG.houseClearance.accessDifficulties;
export type BillingType = 'halfDay' | 'fullDay' | 'overtime' | 'warningZone' | 'splitDay';
export type SurchargeType = 'saturday' | 'bankHoliday' | null;
