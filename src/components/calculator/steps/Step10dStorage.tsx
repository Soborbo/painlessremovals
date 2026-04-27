/**
 * STEP 10D: STORAGE SERVICE
 *
 * Allow users to add storage to their removal quote.
 * Features size selection and duration options with promotional pricing.
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { PictureImg } from '@/components/ui/picture-img';
import {
  calculatorStore,
  setStorageDetails,
  nextStep,
  prevStep,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG, type StorageSizeKey } from '@/lib/calculator-config';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { cn } from '@/lib/utils';


// Storage size to image mapping
const storageSizeImages: Record<StorageSizeKey, string> = {
  smallWardrobe: '/images/calculator/storage/wardrobe.jpg',
  gardenShed: '/images/calculator/storage/shed.jpg',
  smallBedroom: '/images/calculator/storage/small-bedroom.jpg',
  standardBedroom: '/images/calculator/storage/avg-bedroom.jpg',
  largeBedroom: '/images/calculator/storage/large-bedroom.jpg',
  oneCarGarage: '/images/calculator/storage/garage.jpg',
};

// Duration value type
type DurationValue = 1 | 4 | 8 | 12 | 26 | 52 | 'other';

// Format currency
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
  }).format(price);
}

// Get recommended storage size based on property
function getRecommendedSize(propertySize: string | null): StorageSizeKey {
  const sizeMap: Record<string, StorageSizeKey> = {
    'studio': 'gardenShed',
    '1bed': 'smallBedroom',
    '2bed': 'standardBedroom',
    '3bed-small': 'standardBedroom',
    '3bed-large': 'largeBedroom',
    '4bed': 'largeBedroom',
    '5bed': 'oneCarGarage',
    '5bed-plus': 'oneCarGarage',
  };
  return propertySize ? (sizeMap[propertySize] || 'standardBedroom') : 'standardBedroom';
}

export function Step10dStorage() {
  const state = useStore(calculatorStore);

  // Get recommended size
  const recommendedSize = getRecommendedSize(state.propertySize);

  // Local state
  const [selectedSize, setSelectedSize] = useState<StorageSizeKey>(
    (state.extras.storageSize as StorageSizeKey) || recommendedSize
  );
  const [selectedDuration, setSelectedDuration] = useState<DurationValue>(
    state.extras.storageWeeks === 1 ? 1 :
    state.extras.storageWeeks === 4 ? 4 :
    state.extras.storageWeeks === 8 ? 8 :
    state.extras.storageWeeks === 12 ? 12 :
    state.extras.storageWeeks === 26 ? 26 :
    state.extras.storageWeeks === 52 ? 52 :
    8 // Default to 2 months for promo
  );

  // Get weeks from duration value
  const getWeeks = (duration: DurationValue): number => {
    if (duration === 'other') return 4; // Default to 1 month
    return duration;
  };

  // Calculate pricing
  const sizeConfig = CALCULATOR_CONFIG.storageSizes[selectedSize];
  const weeklyRate = sizeConfig.price;
  const weeks = getWeeks(selectedDuration);

  // Apply 50% discount for first 2 months (8 weeks)
  const discountedWeeks = Math.min(weeks, 8);
  const fullPriceWeeks = Math.max(0, weeks - 8);
  const discountedCost = discountedWeeks * weeklyRate * 0.5;
  const fullPriceCost = fullPriceWeeks * weeklyRate;
  const totalPrice = discountedCost + fullPriceCost;

  // Sync with store on mount
  useEffect(() => {
    if (state.extras.storageSize) {
      setSelectedSize(state.extras.storageSize as StorageSizeKey);
    }
  }, [state.extras.storageSize]);

  // Handle continue
  const handleContinue = () => {
    setStorageDetails(selectedSize, weeks);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          How much storage space do you need?
        </h2>
        <p className="text-muted-foreground mt-2">
          Secure, climate-controlled storage for your belongings
        </p>
      </div>

      {/* Promo banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
        <p className="text-emerald-800 font-semibold">
          First 2 months at 50% off!
        </p>
        <p className="text-sm text-emerald-600 mt-1">
          Great if your new place isn't quite ready yet
        </p>
      </div>

      {/* Size selection */}
      <div>
        <h3 className="font-medium text-foreground mb-3">Select storage size:</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.entries(CALCULATOR_CONFIG.storageSizes) as [StorageSizeKey, typeof CALCULATOR_CONFIG.storageSizes.smallWardrobe][]).map(
            ([sizeKey, config]) => {
              const isSelected = selectedSize === sizeKey;
              const isRecommended = sizeKey === recommendedSize;

              return (
                <StorageSizeCard
                  key={sizeKey}
                  sizeKey={sizeKey}
                  label={config.label}
                  sqft={config.sqft}
                  weeklyPrice={config.price}
                  description={config.description}
                  fits={config.fits}
                  {...('badge' in config && (config as { badge?: string }).badge !== undefined && { badge: (config as { badge: string }).badge })}
                  image={storageSizeImages[sizeKey]}
                  isSelected={isSelected}
                  isRecommended={isRecommended}
                  onSelect={() => setSelectedSize(sizeKey)}
                />
              );
            }
          )}
        </div>
      </div>

      {/* Duration selection */}
      <div>
        <h3 className="font-medium text-foreground mb-3">How long do you need storage? (estimate)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {CALCULATOR_CONFIG.storageDurations.map((duration) => {
            const isSelected = selectedDuration === duration.value;
            const hasBadge = 'badge' in duration && duration.badge;

            return (
              <button
                key={String(duration.value)}
                type="button"
                onClick={() => setSelectedDuration(duration.value as DurationValue)}
                className={cn(
                  'relative px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all',
                  isSelected
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50 text-foreground'
                )}
              >
                {duration.label}
                {hasBadge && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full whitespace-nowrap">
                    {duration.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Minimum 1 week. You can extend later if needed.
        </p>
      </div>

      {/* What fits info for selected size */}
      <div className="bg-muted/30 rounded-lg p-4">
        <h3 className="font-medium text-foreground mb-2">
          {sizeConfig.label} ({sizeConfig.sqft} sq ft) - What fits:
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {sizeConfig.fits.map((item, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="h-4 w-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Price summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {formatPrice(weeklyRate)}/week × {weeks} week{weeks > 1 ? 's' : ''}
            {weeks <= 8 && (
              <span className="text-emerald-600 font-medium"> (50% off!)</span>
            )}
            {weeks > 8 && (
              <span className="text-emerald-600 font-medium"> (first 8 weeks 50% off)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-foreground font-medium">Estimated total:</span>
            <span className="text-3xl font-bold text-primary">{formatPrice(totalPrice)}</span>
          </div>
          {weeks <= 8 && (
            <div className="text-sm text-muted-foreground">
              <span className="line-through">{formatPrice(weeklyRate * weeks)}</span>
              <span className="text-emerald-600 ml-2">Save {formatPrice(weeklyRate * weeks - totalPrice)}!</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        nextLabel="Continue"
      />
    </div>
  );
}

// Storage size card
interface StorageSizeCardProps {
  sizeKey: StorageSizeKey;
  label: string;
  sqft: number;
  weeklyPrice: number;
  description: string;
  fits: readonly string[];
  badge?: string;
  image?: string;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}

function StorageSizeCard({
  label,
  sqft,
  weeklyPrice,
  badge,
  image,
  isSelected,
  isRecommended,
  onSelect,
}: StorageSizeCardProps) {
  return (
    <div
      className={cn(
        'relative cursor-pointer rounded-xl border-2 overflow-hidden',
        'transition-all duration-300 ease-out',
        'border-border shadow-sm',
        !isSelected && 'hover:border-primary/50 hover:shadow-lg',
        isSelected && [
          'border-primary bg-primary/5',
          'shadow-lg shadow-primary/10',
          'ring-2 ring-primary ring-offset-2 ring-offset-background',
        ],
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="radio"
      aria-checked={isSelected}
    >
      {/* Badge */}
      {badge && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground rounded-full whitespace-nowrap">
          {badge}
        </div>
      )}

      {/* Recommended indicator */}
      {isRecommended && !badge && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded-full whitespace-nowrap">
          Recommended
        </div>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs shadow-md">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      {/* Image */}
      {image && (
        <div className="w-full aspect-square overflow-hidden">
          <PictureImg
            src={image}
            alt={`${label} storage unit`}
            className={cn(
              'w-full h-full object-cover transition-transform duration-300',
              isSelected ? 'scale-105' : 'group-hover:scale-105'
            )}
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="text-center space-y-1 p-3">
        <div className={cn(
          'font-semibold transition-colors',
          isSelected ? 'text-primary' : 'text-foreground'
        )}>
          {label}
        </div>
        <div className="text-xs text-muted-foreground">
          ~{sqft} sq ft
        </div>
        <div className={cn(
          'text-lg font-bold transition-colors',
          isSelected ? 'text-primary' : 'text-foreground'
        )}>
          {formatPrice(weeklyPrice)}
          <span className="text-xs font-normal text-muted-foreground">/week</span>
        </div>
      </div>
    </div>
  );
}

export default Step10dStorage;
