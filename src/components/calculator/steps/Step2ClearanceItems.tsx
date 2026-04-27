/**
 * STEP 2 (CLEARANCE): DISPOSAL ITEMS SELECTION
 *
 * Quick Price Estimator for house clearance.
 * Vertical card layout with large images and clear quantity controls.
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { PictureImg } from '@/components/ui/picture-img';
import {
  calculatorStore,
  setClearanceItems,
  nextStep,
  prevStep,
  type ClearanceDisposalItem,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { CONFIG } from '@/lib/config';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { cn } from '@/lib/utils';


type DisposalItemType = keyof typeof CALCULATOR_CONFIG.houseClearance.disposal;

// Item display config with images, short names and unit labels
const ITEM_CONFIG: Record<DisposalItemType, {
  image: string;
  shortName: string;
  unitLabel: string;
}> = {
  gardenWaste: {
    image: '/images/calculator/clearance/gardenwaste.jpg',
    shortName: 'Garden Waste',
    unitLabel: '/ ton bag',
  },
  mixedWaste: {
    image: '/images/calculator/clearance/mixed-household-waste.jpg',
    shortName: 'Mixed Waste',
    unitLabel: '/ ton bag',
  },
  sofa: {
    image: '/images/calculator/clearance/sofa.jpg',
    shortName: 'Sofa',
    unitLabel: '/ set',
  },
  mattress: {
    image: '/images/calculator/clearance/mattress.jpg',
    shortName: 'Mattress',
    unitLabel: '/ each',
  },
  bedSet: {
    image: '/images/calculator/clearance/bed-and-mattress.jpg',
    shortName: 'Bed + Mattress',
    unitLabel: '/ set',
  },
  fridge: {
    image: '/images/calculator/clearance/fridge.jpg',
    shortName: 'Fridge / Freezer',
    unitLabel: '/ each',
  },
  largeAppliance: {
    image: '/images/calculator/clearance/fridge.jpg',
    shortName: 'Large Appliance',
    unitLabel: '/ each',
  },
  washingMachine: {
    image: '/images/calculator/clearance/washing-machine.jpg',
    shortName: 'Washing Machine',
    unitLabel: '/ each',
  },
  fullRoom: {
    image: '/images/calculator/clearance/full-room.jpg',
    shortName: 'Full Room',
    unitLabel: '/ room',
  },
};

// Order of items as shown in the UI
const ITEM_ORDER: DisposalItemType[] = [
  'gardenWaste',
  'mixedWaste',
  'sofa',
  'mattress',
  'bedSet',
  'fridge',
  'largeAppliance',
  'washingMachine',
  'fullRoom',
];

export function Step2ClearanceItems() {
  const state = useStore(calculatorStore);

  // Initialize quantities from store
  const [quantities, setQuantities] = useState<Map<DisposalItemType, number>>(() => {
    const map = new Map<DisposalItemType, number>();
    for (const item of state.clearance?.disposalItems || []) {
      if (item.quantity > 0) {
        map.set(item.type as DisposalItemType, item.quantity);
      }
    }
    return map;
  });

  // Sync with store
  useEffect(() => {
    const map = new Map<DisposalItemType, number>();
    for (const item of state.clearance?.disposalItems || []) {
      if (item.quantity > 0) {
        map.set(item.type as DisposalItemType, item.quantity);
      }
    }
    setQuantities(map);
  }, [state.clearance?.disposalItems]);

  // Update quantity
  const updateQuantity = (type: DisposalItemType, delta: number) => {
    setQuantities(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(type) || 0;
      const newQty = Math.max(0, Math.min(20, current + delta));
      if (newQty === 0) {
        newMap.delete(type);
      } else {
        newMap.set(type, newQty);
      }
      return newMap;
    });
  };

  const hasItems = quantities.size > 0;

  // Handle continue
  const handleContinue = () => {
    const items: ClearanceDisposalItem[] = Array.from(quantities.entries()).map(
      ([type, quantity]) => ({ type, quantity })
    );
    setClearanceItems(items);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          What needs to be cleared?
        </h2>
        <p className="text-muted-foreground mt-2">
          Select the items you need cleared
        </p>
      </div>

      {/* Items grid - vertical cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {ITEM_ORDER.map((type) => {
          const config = CALCULATOR_CONFIG.houseClearance.disposal[type];
          const itemConfig = ITEM_CONFIG[type];
          const quantity = quantities.get(type) || 0;
          const isActive = quantity > 0;

          return (
            <div
              key={type}
              className={cn(
                'rounded-xl border-2 bg-card overflow-hidden transition-all duration-300 flex flex-col',
                isActive
                  ? 'border-[#6a9c95] shadow-lg ring-1 ring-[#6a9c95]/20 -translate-y-0.5'
                  : 'border-border hover:border-[#6a9c95]/40 hover:shadow-md'
              )}
            >
              {/* Image */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/20">
                <PictureImg
                  src={`${CONFIG.site.assetBaseUrl}${itemConfig.image}`}
                  alt={itemConfig.shortName}
                  width={300}
                  height={225}
                  className={cn(
                    'w-full h-full object-cover transition-transform duration-300',
                    isActive && 'scale-105'
                  )}
                  loading="lazy"
                />
                {/* Quantity badge on image */}
                {isActive && (
                  <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-bold shadow-lg">
                    {quantity}
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div className={cn(
                'px-3 py-2 text-center transition-colors',
                isActive ? 'bg-[#6a9c95] text-white' : 'bg-muted/30'
              )}>
                <h3 className={cn(
                  'font-semibold text-sm',
                  isActive ? 'text-white' : 'text-foreground'
                )}>
                  {itemConfig.shortName}
                </h3>
                <p className={cn(
                  'text-xs mt-0.5',
                  isActive ? 'text-white/80' : 'text-muted-foreground'
                )}>
                  <span className="font-bold">£{config.price}</span> {itemConfig.unitLabel}
                </p>
              </div>

              {/* Quantity controls */}
              <div className="flex items-center justify-center gap-3 p-2.5 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => updateQuantity(type, -1)}
                  disabled={quantity === 0}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-base font-bold',
                    'border-2 transition-all',
                    quantity > 0
                      ? 'border-[#6a9c95] text-[#6a9c95] hover:bg-[#6a9c95] hover:text-white active:scale-95'
                      : 'border-gray-200 text-gray-300 cursor-not-allowed'
                  )}
                  aria-label={`Decrease ${itemConfig.shortName}`}
                >
                  −
                </button>
                <span className={cn(
                  'text-xl font-bold w-8 text-center tabular-nums',
                  quantity > 0 ? 'text-foreground' : 'text-muted-foreground/40'
                )}>
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(type, 1)}
                  disabled={quantity >= 20}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-base font-bold',
                    'border-2 border-[#6a9c95] text-[#6a9c95] transition-all',
                    'hover:bg-[#6a9c95] hover:text-white active:scale-95',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  aria-label={`Increase ${itemConfig.shortName}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>


      {/* Validation message */}
      {!hasItems && (
        <p className="text-center text-sm text-muted-foreground">
          Select at least one item to continue
        </p>
      )}

      {/* Navigation */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        nextLabel="Continue"
        canGoNext={hasItems}
      />
    </div>
  );
}

export default Step2ClearanceItems;
