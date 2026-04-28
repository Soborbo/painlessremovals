/**
 * STEP 10B: FURNITURE DISASSEMBLY
 *
 * Allow users to select furniture items that need professional
 * disassembly and reassembly, with quantity inputs per category.
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setDisassemblyItems,
  nextStep,
  prevStep,
  type DisassemblyItem,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG, type AssemblyComplexity } from '@/lib/calculator-config';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { SelectionCardGrid } from '@/components/ui/selection-card';
import { CheckIcon } from '@/components/icons/CheckIcon';
import { getImageSources, type CalcImageKey } from '@/lib/calculator-images';
import { cn, formatPriceGBP } from '@/lib/utils';

const CATEGORY_CONFIG: Record<AssemblyComplexity, {
  imageKey: CalcImageKey;
  examples: string;
}> = {
  verySimple: { imageKey: 'step10-disassembly-table', examples: 'Tables, TV stands, simple desks' },
  simple: { imageKey: 'step10-disassembly-frame-bed', examples: 'Frame beds, bookshelves, IKEA furniture' },
  general: { imageKey: 'step10-disassembly-bunk-bed', examples: 'Ottoman beds, cabin beds, bunk beds, double wardrobes' },
  complex: { imageKey: 'step10-disassembly-complex', examples: 'Sliding-door wardrobes, mirrored units, grandfather clocks' },
  veryComplex: { imageKey: 'step10-disassembly-gym', examples: 'Gym equipment, custom-made furniture, wall beds' },
};

export function Step10bDisassembly() {
  const state = useStore(calculatorStore);

  // Initialize from store
  const [items, setItems] = useState<Map<AssemblyComplexity, number>>(() => {
    const map = new Map<AssemblyComplexity, number>();
    for (const item of state.extras.disassemblyItems || []) {
      map.set(item.category, item.quantity);
    }
    return map;
  });

  // Sync with store when it changes (e.g., from localStorage reload)
  useEffect(() => {
    const map = new Map<AssemblyComplexity, number>();
    for (const item of state.extras.disassemblyItems || []) {
      map.set(item.category, item.quantity);
    }
    setItems(map);
  }, [state.extras.disassemblyItems]);

  // Toggle category selection
  const toggleCategory = (category: AssemblyComplexity) => {
    setItems(prev => {
      const newMap = new Map(prev);
      if (newMap.has(category)) {
        newMap.delete(category);
      } else {
        newMap.set(category, 1);
      }
      return newMap;
    });
  };

  // Update quantity
  const updateQuantity = (category: AssemblyComplexity, delta: number) => {
    setItems(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(category) || 1;
      const newQty = current + delta;
      if (newQty < 1) {
        newMap.delete(category);
      } else {
        newMap.set(category, Math.min(9, newQty));
      }
      return newMap;
    });
  };

  // Handle continue
  const handleContinue = () => {
    const disassemblyItems: DisassemblyItem[] = Array.from(items.entries()).map(
      ([category, quantity]) => ({ category, quantity })
    );
    setDisassemblyItems(disassemblyItems);
    nextStep();
  };

  // Check if valid (at least one item selected)
  const isValid = items.size > 0;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Which furniture needs disassembly and reassembly?
        </h2>
        <p className="text-muted-foreground mt-2">
          Save time and avoid damage - our experts handle it safely
        </p>
      </div>

      {/* Category cards */}
      <SelectionCardGrid columns={{ default: 2, sm: 2, md: 3 }} className="!auto-rows-auto !items-start">
        {(Object.entries(CALCULATOR_CONFIG.assembly) as [AssemblyComplexity, typeof CALCULATOR_CONFIG.assembly.verySimple][]).map(
          ([category, config]) => {
            const isSelected = items.has(category);
            const quantity = items.get(category) || 0;
            const categoryConfig = CATEGORY_CONFIG[category];

            return (
              <DisassemblyCard
                key={category}
                category={category}
                label={config.label}
                examples={categoryConfig.examples}
                price={config.price}
                imageKey={categoryConfig.imageKey}
                isSelected={isSelected}
                quantity={quantity}
                onToggle={() => toggleCategory(category)}
                onQuantityChange={(delta) => updateQuantity(category, delta)}
              />
            );
          }
        )}
      </SelectionCardGrid>


      {/* Validation message */}
      {!isValid && (
        <p className="text-center text-sm text-muted-foreground">
          Select at least one furniture item to continue, or go back to remove this service
        </p>
      )}

      {/* Navigation */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        nextLabel="Continue"
        canGoNext={isValid}
      />
    </div>
  );
}

// Disassembly card component
interface DisassemblyCardProps {
  category: AssemblyComplexity;
  label: string;
  examples: string;
  price: number;
  imageKey: CalcImageKey;
  isSelected: boolean;
  quantity: number;
  onToggle: () => void;
  onQuantityChange: (delta: number) => void;
}

function DisassemblyCard({
  label,
  examples,
  price,
  imageKey,
  isSelected,
  quantity,
  onToggle,
  onQuantityChange,
}: DisassemblyCardProps) {
  const imageConfig = getImageSources(imageKey);

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-xl border-2 bg-card text-card-foreground',
        'transition-all duration-500 ease-out',
        'border-border shadow-sm',
        !isSelected && [
          'hover:-translate-y-1 hover:scale-[1.02]',
          'hover:border-[#6a9c95]/50 hover:shadow-lg',
        ],
        isSelected && [
          '-translate-y-1.5 scale-[1.03]',
          'border-[#6a9c95] bg-[#6a9c95]/5',
          'shadow-xl shadow-[#6a9c95]/10',
          'ring-2 ring-[#6a9c95] ring-offset-2 ring-offset-background',
        ],
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a9c95] focus-visible:ring-offset-2'
      )}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      tabIndex={0}
      role="checkbox"
      aria-checked={isSelected}
    >
      {/* Selected check indicator */}
      <div
        className={cn(
          'absolute -top-2 -right-2 z-10',
          'flex h-7 w-7 items-center justify-center rounded-full',
          'bg-emerald-500 text-white text-xs font-bold',
          'shadow-lg shadow-emerald-500/30',
          'transition-all duration-500',
          isSelected
            ? 'scale-100 opacity-100 animate-bounce-once'
            : 'scale-0 opacity-0'
        )}
      >
        <CheckIcon />
      </div>

      {/* Image container - 1:1 aspect ratio */}
      <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
        <picture>
          <source srcSet={imageConfig.avifSrcSet} sizes={imageConfig.sizes} type="image/avif" />
          <source srcSet={imageConfig.webpSrcSet} sizes={imageConfig.sizes} type="image/webp" />
          <img
            src={imageConfig.fallbackSrc}
            srcSet={imageConfig.jpgSrcSet}
            sizes={imageConfig.sizes}
            alt={imageConfig.alt}
            width={imageConfig.width}
            height={imageConfig.height}
            className={cn(
              'h-full w-full object-cover',
              'transition-transform duration-300 ease-out',
              'group-hover:scale-110',
              isSelected && 'scale-105'
            )}
            loading="lazy"
          />
        </picture>
      </div>

      {/* Title bar - matches SelectionCard green bar */}
      <div className={cn(
        "flex flex-col justify-between p-3 pt-2 text-center bg-[#6a9c95] min-h-[5.5rem]",
        !isSelected && "rounded-b-lg"
      )}>
        <div>
          <h3 className="font-semibold text-sm text-white transition-colors duration-200">
            {label}
          </h3>
          <p className="text-xs text-white/80 mt-0.5">{examples}</p>
        </div>
        <p className="text-white font-semibold text-xs mt-1">{formatPriceGBP(price)} per item</p>
      </div>

      {/* Quantity controls - only show when selected */}
      {isSelected && (
        <div
          className="flex items-center justify-center gap-3 p-3 border-t border-border bg-muted/30"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onQuantityChange(-1)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              'border-2 border-[#6a9c95] text-[#6a9c95] font-bold',
              'transition-all hover:bg-[#6a9c95] hover:text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#6a9c95]'
            )}
            aria-label="Decrease quantity"
          >
            -
          </button>
          <span className="text-lg font-bold text-foreground w-8 text-center">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => onQuantityChange(1)}
            disabled={quantity >= 9}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              'border-2 border-[#6a9c95] text-[#6a9c95] font-bold',
              'transition-all hover:bg-[#6a9c95] hover:text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#6a9c95]'
            )}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

export default Step10bDisassembly;
