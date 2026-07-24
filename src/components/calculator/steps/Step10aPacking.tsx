/**
 * STEP 10A: PACKING SERVICE
 *
 * Redesigned pricing page with two sections:
 * 1. Fragile Only - flat rate kitchen/fragile packing
 * 2. Full House Packing - 4 size tiers (Small, Medium, Large, Extra)
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { PictureImg } from '@/components/ui/picture-img';
import {
  calculatorStore,
  calculatedCubes,
  setPackingTier,
  clearPackingExtra,
  nextStep,
  prevStep,
  type PackingTier,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { getPackingSizeCategory, type PackingSizeCategory } from '@/lib/constants';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { cn } from '@/lib/utils';
import { CheckIcon } from '@/components/icons/CheckIcon';


const FRAGILE_ONLY = {
  key: 'fragile' as PackingTier,
  title: 'Fragile Only',
  subtitle: "Perfect if you're happy packing clothes and books, but want expert hands for your kitchen and fragile items.",
  description: '',
  image: '/images/calculator/step-10-extras/packing/kitchen-packing-fragile.jpg',
  features: [
    'Kitchen items professionally packed',
    'China, glassware & ceramics',
    'Mirrors, pictures & artwork',
    'All materials provided',
    '£15k insurance coverage',
  ],
};

const FULL_HOUSE_TIERS = [
  {
    key: 'fullService' as PackingTier,
    sizeKey: 'small',
    label: 'Small',
    subtitle: 'Flats and smaller homes',
    officeSubtitle: 'Small office, up to ~10 desks',
    image: '/images/calculator/step-10-extras/packing/packing-small.jpg',
    badge: null,
    features: [
      '250-750 cu ft',
      '2-person team',
      'All materials provided',
      '£15k insurance coverage',
    ],
  },
  {
    key: 'fullService' as PackingTier,
    sizeKey: 'medium',
    label: 'Medium',
    subtitle: '2-3 bedroom homes',
    officeSubtitle: 'Medium office, ~10–25 desks',
    image: '/images/calculator/step-10-extras/packing/packing-medium.jpg',
    badge: 'Most Popular',
    features: [
      '751-1350 cu ft',
      '3-person team',
      'All materials provided',
      '£15k insurance coverage',
    ],
  },
  {
    key: 'fullService' as PackingTier,
    sizeKey: 'large',
    label: 'Large',
    subtitle: '3-4 bedroom family homes',
    officeSubtitle: 'Large office, ~25–50 desks',
    image: '/images/calculator/step-10-extras/packing/packing-large.jpg',
    badge: null,
    features: [
      '1351-2000 cu ft',
      '4-person team',
      'All materials provided',
      '£15k insurance coverage',
    ],
  },
  {
    key: 'fullService' as PackingTier,
    sizeKey: 'xl',
    label: 'Extra',
    subtitle: '5+ bedrooms or lots of stuff',
    officeSubtitle: '50+ desks or multi-floor office',
    image: '/images/calculator/step-10-extras/packing/packing-extra-large.jpg',
    badge: null,
    features: [
      '2001+ cu ft',
      '5-person team',
      'All materials provided',
      '£15k insurance coverage',
    ],
  },
];

type Selection = 'fragile' | 'small' | 'medium' | 'large' | 'xl' | null;

export function Step10aPacking() {
  const state = useStore(calculatorStore);
  // Billing follows the surveyed volume, not the card the buyer taps, so each
  // card must quote the band getExtrasCost() will charge. Config is the source.
  const cubes = useStore(calculatedCubes);
  const sizeCategory = getPackingSizeCategory(cubes);
  const fragilePrice = CALCULATOR_CONFIG.packingTiers.fragile.priceBySize[sizeCategory];
  const fullServicePrice = (size: PackingSizeCategory) =>
    CALCULATOR_CONFIG.packingTiers.fullService.priceBySize[size];

  const [selected, setSelected] = useState<Selection>(
    state.extras.packingTier === 'fragile'
      ? 'fragile'
      : state.extras.packingTier === 'fullService'
        ? (state.extras.packingSize ?? sizeCategory)
        : sizeCategory // pre-select the band that matches their volume
  );

  useEffect(() => {
    if (state.extras.packingTier === 'fragile') {
      setSelected('fragile');
    }
  }, [state.extras.packingTier]);

  const handleSelect = (sel: Selection) => {
    setSelected(sel);
  };

  const handleContinue = () => {
    if (!selected) return;
    const tier: PackingTier = selected === 'fragile' ? 'fragile' : 'fullService';
    setPackingTier(tier, tier === 'fullService' ? (selected as PackingSizeCategory) : undefined);
    nextStep();
  };

  // The extras gateway is optional, so this sub-step must never force a
  // paid packing choice. Anyone who opened it but doesn't want packing can
  // bow out here — we clear any priced tier and drop packing from the
  // gateway so it leaves the price, quote and emails entirely.
  const handleNoPacking = () => {
    clearPackingExtra();
    nextStep();
  };

  return (
    <div className="space-y-10">
      {/* Page Title */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground">
          Simple, Transparent Pricing
        </h2>
        <p className="text-muted-foreground mt-2 text-lg">
          Estimated pricing based on property size. All materials included.
        </p>
      </div>

      {/* ─── FRAGILE ONLY SECTION ─── */}
      <div
        className={cn(
          'relative rounded-2xl border-2 overflow-hidden transition-all duration-300 cursor-pointer',
          selected === 'fragile'
            ? 'border-primary shadow-xl shadow-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5'
            : 'border-border hover:border-primary/50 hover:shadow-lg'
        )}
        onClick={() => handleSelect('fragile')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect('fragile');
          }
        }}
        tabIndex={0}
        role="radio"
        aria-checked={selected === 'fragile'}
      >
        {/* Selected indicator */}
        {selected === 'fragile' && (
          <div className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-bounce-once">
            <CheckIcon className="h-4 w-4" strokeWidth={3} />
          </div>
        )}
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="relative md:w-2/5 shrink-0 overflow-hidden">
            <PictureImg
              src={FRAGILE_ONLY.image}
              alt="Professional kitchen packing service"
              className="h-full w-full object-cover absolute inset-0 hidden md:block"
              loading="lazy"
              width={400}
              height={300}
            />
            {/* mobile: source images are square — show them whole rather than cropping a face off */}
            <PictureImg
              src={FRAGILE_ONLY.image}
              alt="Professional kitchen packing service"
              className="w-full h-auto md:hidden"
              loading="lazy"
              width={660}
              height={660}
            />
          </div>

          {/* Content */}
          <div className="p-5 md:p-6 flex flex-col justify-center flex-1">
            <h3 className="text-xl font-bold text-foreground mb-1">
              {FRAGILE_ONLY.title}
            </h3>
            <p className="text-muted-foreground mb-3 text-sm">
              {FRAGILE_ONLY.subtitle}
            </p>

            {/* Features */}
            <ul className="space-y-1.5 mb-4">
              {FRAGILE_ONLY.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CheckIcon className="h-4 w-4 text-primary shrink-0" strokeWidth={2.5} />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Price */}
            <div>
              <span className="text-2xl font-bold text-primary">
                £{fragilePrice}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── FULL HOUSE / OFFICE PACKING SECTION ─── */}
      <div>
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-foreground">
            {state.serviceType === 'office' ? 'Full Office Packing Service' : 'Full House Packing Service'}
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FULL_HOUSE_TIERS.map((tier) => {
            const isSelected = selected === tier.sizeKey;

            return (
              <div
                key={tier.sizeKey}
                className={cn(
                  'relative rounded-xl border-2 bg-card overflow-hidden transition-all duration-300 cursor-pointer flex flex-col',
                  isSelected
                    ? 'border-primary shadow-xl shadow-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background -translate-y-1 bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:shadow-lg hover:-translate-y-1'
                )}
                onClick={() => handleSelect(tier.sizeKey as Selection)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(tier.sizeKey as Selection);
                  }
                }}
                tabIndex={0}
                role="radio"
                aria-checked={isSelected}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-3 left-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-bounce-once">
                    <CheckIcon className="h-4 w-4" strokeWidth={3} />
                  </div>
                )}

                {/* Badge */}
                {tier.badge && (
                  <div className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    {tier.badge}
                  </div>
                )}

                {/* Image */}
                {/* mobile: full square image, no crop. From md up the 4:3 card crop returns. */}
                <div className="relative overflow-hidden md:aspect-[4/3]">
                  <PictureImg
                    src={tier.image}
                    alt={`${tier.label} packing service`}
                    className="w-full h-auto md:absolute md:inset-0 md:h-full md:object-cover"
                    loading="lazy"
                    width={660}
                    height={660}
                  />
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <h4 className={cn(
                    'text-lg font-bold transition-colors',
                    isSelected ? 'text-primary' : 'text-foreground'
                  )}>
                    {tier.label}
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {state.serviceType === 'office' ? tier.officeSubtitle : tier.subtitle}
                  </p>

                  {/* Price */}
                  <div className="mb-4">
                    <span className="text-2xl font-bold text-primary">
                      £{fullServicePrice(tier.sizeKey as PackingSizeCategory)}
                    </span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-1.5 mb-4 flex-1">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckIcon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" strokeWidth={2.5} />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* No-packing escape — keeps this sub-step skippable, matching the
          gateway. Without it, Continue stays disabled until a paid tier is
          picked, which forced packing onto people who didn't want it. */}
      <div className="text-center">
        <button
          type="button"
          onClick={handleNoPacking}
          className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          I don&apos;t need packing — skip this step
        </button>
      </div>

      {/* Navigation */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        nextLabel="Continue"
        canGoNext={selected !== null}
      />
    </div>
  );
}

export default Step10aPacking;
