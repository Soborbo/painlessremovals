/**
 * STEP 3: BELONGINGS SLIDER
 *
 * 5-position slider to estimate belongings volume.
 * Elegant card layout with cinematic hero image and refined controls.
 */

import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setSliderPosition,
  calculatedCubes,
  recommendedResources,
  nextStep,
  prevStep,
} from '@/lib/calculator-store';
import type { SliderPosition } from '@/lib/calculator-config';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { cn } from '@/lib/utils';
import { getImageSources, type CalcImageKey } from '@/lib/calculator-images';
import { Step3ClearanceAccess } from './Step3ClearanceAccess';

// Slider position details
const sliderDetails: Record<SliderPosition, {
  label: string;
  description: string;
}> = {
  1: {
    label: 'Minimalist',
    description: 'Very few possessions, mostly empty rooms',
  },
  2: {
    label: 'Light',
    description: 'Essential furniture only, not much clutter',
  },
  3: {
    label: 'Average',
    description: 'Typical furnished home, normal amount of stuff',
  },
  4: {
    label: 'Full',
    description: 'Well-furnished with plenty of belongings',
  },
  5: {
    label: 'Packed',
    description: 'Every room is full, lots of items everywhere',
  },
};

// SVG Icons
function VanIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M1 12.5V17a1 1 0 001 1h1.5" />
      <path d="M16 18h2.5a1 1 0 001-1v-4.5" />
      <path d="M1 12.5h15V6a1 1 0 00-1-1H2a1 1 0 00-1 1v6.5z" />
      <path d="M16 8h3l2.5 4.5v5" />
      <circle cx="6" cy="18.5" r="1.5" />
      <circle cx="16" cy="18.5" r="1.5" />
      <path d="M7.5 18H14.5" />
    </svg>
  );
}

function MoverIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M8 10a4 4 0 018 0" />
      <path d="M10 10v5" />
      <path d="M14 10v5" />
      <path d="M8 21l2-6" />
      <path d="M16 21l-2-6" />
      <path d="M9 13h6" />
    </svg>
  );
}

export function Step3BelongingsSlider() {
  const state = useStore(calculatorStore);
  const cubes = useStore(calculatedCubes);
  const resources = useStore(recommendedResources);

  // Clearance branch: show access difficulties instead of belongings slider
  if (state.serviceType === 'clearance') {
    return <Step3ClearanceAccess />;
  }

  const position = state.sliderPosition as SliderPosition;
  const details = sliderDetails[position];

  const handlePositionChange = (newPosition: SliderPosition) => {
    setSliderPosition(newPosition);
  };

  const handleContinue = () => {
    nextStep();
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          How much stuff do you have?
        </h2>
      </div>

      {/* Image + info - side by side on desktop */}
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          {/* Image - left side */}
          <div className="sm:w-1/2 rounded-xl overflow-hidden shadow-md shrink-0">
            <HeroImage position={position} />
          </div>

          {/* Details - right side */}
          <div className="sm:w-1/2 flex flex-col justify-center gap-3">
            <span className="inline-block self-start px-3 py-1 bg-primary/10 text-primary font-semibold rounded-md text-sm">
              {details.label}
            </span>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {details.description}
            </p>
            <p className="text-muted-foreground/60 text-xs tabular-nums">
              ~{cubes.toLocaleString()} cu ft
            </p>

            {resources && (
              <div className="flex items-center gap-3">
                <ResourceBadge
                  icon={<VanIcon className="w-4 h-4" />}
                  count={resources.vans}
                  label={`van${resources.vans > 1 ? 's' : ''}`}
                />
                <ResourceBadge
                  icon={<MoverIcon className="w-4 h-4" />}
                  count={resources.men}
                  label={`mover${resources.men > 1 ? 's' : ''}`}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slider Control — tighter */}
      <div className="px-1 sm:px-3">
        <div className="relative h-10 flex items-center">
          {/* Background track */}
          <div className="absolute inset-x-0 h-1 bg-border rounded-full" />

          {/* Filled track */}
          <div
            className="absolute left-0 h-1 bg-primary rounded-full transition-all duration-200 ease-out"
            style={{ width: `${((position - 1) / 4) * 100}%` }}
          />

          {/* Clickable stops */}
          <div className="relative w-full flex justify-between">
            {([1, 2, 3, 4, 5] as SliderPosition[]).map((pos) => {
              const isActive = pos === position;
              const isFilled = pos <= position;
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => handlePositionChange(pos)}
                  className={cn(
                    'relative z-10 rounded-full transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    isActive
                      ? 'w-8 h-8 bg-primary shadow-md shadow-primary/25'
                      : isFilled
                        ? 'w-3.5 h-3.5 bg-primary hover:scale-125 cursor-pointer'
                        : 'w-3.5 h-3.5 bg-muted-foreground/25 hover:bg-muted-foreground/40 hover:scale-125 cursor-pointer',
                  )}
                  aria-label={sliderDetails[pos].label}
                  aria-pressed={isActive}
                >
                  {isActive && (
                    <span className="absolute inset-0 flex items-center justify-center text-primary-foreground text-[11px] font-bold">
                      {pos}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Hidden range for keyboard & drag support */}
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={position}
            onChange={(e) => handlePositionChange(parseInt(e.target.value) as SliderPosition)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            aria-label="Belongings amount"
          />
        </div>

        {/* Labels */}
        <div className="flex justify-between mt-1">
          {([1, 2, 3, 4, 5] as SliderPosition[]).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => handlePositionChange(pos)}
              className={cn(
                'text-[11px] sm:text-xs text-center transition-all duration-200 px-0.5 leading-tight',
                pos === position
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground/50 hover:text-muted-foreground',
              )}
            >
              {sliderDetails[pos].label}
            </button>
          ))}
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

// ===================
// RESOURCE BADGE
// ===================

function ResourceBadge({
  icon,
  count,
  label,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1">
      <div className="text-primary">{icon}</div>
      <span className="text-sm font-bold text-foreground leading-none tabular-nums">{count}</span>
      <span className="text-[9px] text-muted-foreground leading-none">{label}</span>
    </div>
  );
}

// ===================
// HERO IMAGE COMPONENT
// ===================

const BELONGINGS_IMAGES: Record<SliderPosition, CalcImageKey> = {
  1: 'step3-minimalist',
  2: 'step3-light',
  3: 'step3-average',
  4: 'step3-full',
  5: 'step3-packed',
};

function HeroImage({ position }: { position: SliderPosition }) {
  const img = getImageSources(BELONGINGS_IMAGES[position]);

  return (
    <picture>
      <source srcSet={img.avifSrcSet} sizes={img.sizes} type="image/avif" />
      <source srcSet={img.webpSrcSet} sizes={img.sizes} type="image/webp" />
      <img
        src={img.fallbackSrc}
        srcSet={img.jpgSrcSet}
        sizes={img.sizes}
        alt={img.alt}
        width={768}
        height={512}
        className="w-full transition-opacity duration-300"
        loading="lazy"
      />
    </picture>
  );
}

export default Step3BelongingsSlider;
