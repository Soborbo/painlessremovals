/**
 * STEP 2B: FURNITURE ONLY FLOW
 *
 * Multi-page flow for moving just furniture items:
 * Page 1: Item count slider
 * Page 2: Size (2-person) and Weight (>40kg) questions - side by side on desktop
 * Page 3: Specialist items selection
 *
 * After completion:
 * - If specialist items → callback required (Step 12)
 * - Otherwise → skip to Step 5 (Date), then 8, 9, 11, 12
 */

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setFurnitureOnly,
  goToStep,
  saveState,
  type FurnitureOnlyData,
} from '@/lib/calculator-store';
import { Card } from '@/components/ui/card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// Specialist items list
const specialistItems = [
  { id: 'piano', label: 'Piano / Grand Piano', icon: '🎹' },
  { id: 'safe', label: 'Safe / Strongbox', icon: '🔐' },
  { id: 'gym-equipment', label: 'Heavy gym equipment', icon: '🏋️' },
  { id: 'hot-tub', label: 'Hot tub / Jacuzzi', icon: '🛁' },
  { id: 'marble-stone', label: 'Marble / Stone furniture', icon: '🪨' },
  { id: 'other', label: 'Other specialist item', icon: '📦' },
];

export function Step2FurnitureOnly() {
  const state = useStore(calculatorStore);

  // Internal page state (1, 2, or 3)
  const [page, setPage] = useState(1);

  // Form data
  const [itemCount, setItemCount] = useState(state.furnitureOnly?.itemCount ?? 3);
  const [needs2Person, setNeeds2Person] = useState<boolean | null>(
    state.furnitureOnly?.needs2Person ?? null
  );
  const [over40kg, setOver40kg] = useState<boolean | null>(
    state.furnitureOnly?.over40kg ?? null
  );
  const [selectedSpecialist, setSelectedSpecialist] = useState<string[]>(
    state.furnitureOnly?.specialistItems ?? []
  );

  // Auto-next timeout ref
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  // Check if specialist items selected (requires callback)
  const hasSpecialistItems = selectedSpecialist.length > 0;

  const handleSpecialistToggle = (itemId: string) => {
    // Clear any pending navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setSelectedSpecialist(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      }
      return [...prev, itemId];
    });
  };

  const handleNoneSelected = () => {
    // Clear any pending navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setSelectedSpecialist([]);

    // Auto-next after selecting "None"
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;
      handleFinalContinue([]);
    }, 300);
  };

  // Go back to property selection
  const handleBackToPropertySelection = () => {
    calculatorStore.setKey('propertySize', null);
    saveState();
  };

  // Handle final continue (save data and navigate)
  const handleFinalContinue = (specialist: string[] = selectedSpecialist) => {
    const data: FurnitureOnlyData = {
      itemCount,
      needs2Person: needs2Person ?? false,
      over40kg: over40kg ?? false,
      specialistItems: specialist,
    };

    setFurnitureOnly(data);

    // Furniture flow (with or without specialist items):
    // Always go through: Date (5) → From (8) → To (9) → Contact (11) → Quote (12)
    // Skips: Plan (4), Access (6), Chain (7), Extras (10)
    // Note: specialist items will trigger callback view at Step 12
    goToStep(5);
  };

  // Render based on current page
  if (page === 1) {
    return (
      <Page1ItemCount
        itemCount={itemCount}
        setItemCount={setItemCount}
        onPrevious={handleBackToPropertySelection}
        onNext={() => setPage(2)}
      />
    );
  }

  if (page === 2) {
    return (
      <Page2SizeWeight
        needs2Person={needs2Person}
        setNeeds2Person={setNeeds2Person}
        over40kg={over40kg}
        setOver40kg={setOver40kg}
        onPrevious={() => setPage(1)}
        onNext={() => setPage(3)}
      />
    );
  }

  // Page 3: Specialist items
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Any SPECIALIST items?
        </h2>
        <p className="text-muted-foreground mt-2">
          These require special equipment and expertise
        </p>
      </div>

      {/* Specialist Items Grid - 3 cols desktop, 2 mobile */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {specialistItems.map((item) => (
          <Card
            key={item.id}
            className={cn(
              'p-4 cursor-pointer transition-all',
              'hover:border-primary/50 hover:-translate-y-1',
              selectedSpecialist.includes(item.id) && 'border-primary bg-primary/5 ring-2 ring-primary'
            )}
            onClick={() => handleSpecialistToggle(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSpecialistToggle(item.id);
              }
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <span className="text-3xl">{item.icon}</span>
              <h3 className="font-semibold text-sm text-foreground">
                {item.label}
              </h3>
              {selectedSpecialist.includes(item.id) && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  ✓
                </span>
              )}
            </div>
          </Card>
        ))}

        {/* None of these - Last card */}
        <Card
          className={cn(
            'p-4 cursor-pointer transition-all',
            'hover:border-primary/50 hover:-translate-y-1',
            selectedSpecialist.length === 0 && 'border-primary bg-primary/5 ring-2 ring-primary'
          )}
          onClick={handleNoneSelected}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNoneSelected();
            }
          }}
        >
          <div className="flex flex-col items-center text-center space-y-2">
            <span className="text-3xl">✅</span>
            <h3 className="font-semibold text-sm text-foreground">
              None of these
            </h3>
            {selectedSpecialist.length === 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                ✓
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Warning if specialist items selected */}
      {hasSpecialistItems && (
        <Alert className="border-amber-500 bg-amber-50">
          <AlertDescription className="text-amber-800">
            <strong>Specialist items require a custom quote.</strong>
            <br />
            We'll call you during business hours to discuss your requirements.
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={() => setPage(2)}
        onNext={() => handleFinalContinue()}
        nextLabel={hasSpecialistItems ? 'Request Callback' : 'Continue'}
        canGoNext={true}
      />
    </div>
  );
}

// ===================
// PAGE 1: ITEM COUNT
// ===================

interface Page1Props {
  itemCount: number;
  setItemCount: (count: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

function Page1ItemCount({ itemCount, setItemCount, onPrevious, onNext }: Page1Props) {
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Tell us about your items
        </h2>
        <p className="text-muted-foreground mt-2">
          This helps us send the right team
        </p>
      </div>

      {/* Item Count Card */}
      <Card className="p-6">
        <h3 className="text-lg font-medium text-foreground mb-6">
          How many items need moving?
        </h3>

        <div className="space-y-6">
          {/* Slider */}
          <div className="px-2">
            <Slider
              value={[itemCount]}
              onValueChange={(value) => setItemCount(value[0] ?? 1)}
              min={1}
              max={10}
              step={1}
            />
          </div>

          {/* Labels */}
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>
            <span>9</span>
            <span>10+</span>
          </div>

          {/* Current value display */}
          <div className="text-center">
            <span className="inline-flex items-center justify-center px-6 py-3 bg-primary/10 text-primary font-bold text-xl rounded-full">
              {itemCount === 10 ? '10+ items' : `${itemCount} item${itemCount > 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
      </Card>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={onPrevious}
        onNext={onNext}
        nextLabel="Continue"
      />
    </div>
  );
}

// ===================
// PAGE 2: SIZE & WEIGHT (Side by side on desktop)
// ===================

interface Page2Props {
  needs2Person: boolean | null;
  setNeeds2Person: (val: boolean) => void;
  over40kg: boolean | null;
  setOver40kg: (val: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
}

function Page2SizeWeight({
  needs2Person,
  setNeeds2Person,
  over40kg,
  setOver40kg,
  onPrevious,
  onNext,
}: Page2Props) {
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onNextRef = useRef(onNext);
  const canContinue = needs2Person !== null && over40kg !== null;

  // Keep onNext ref updated
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  // Auto-next when both questions are answered
  useEffect(() => {
    if (canContinue) {
      // Clear any existing timeout
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      // Auto-next after short delay
      navigationTimeoutRef.current = setTimeout(() => {
        navigationTimeoutRef.current = null;
        onNextRef.current();
      }, 400);
    }
  }, [needs2Person, over40kg, canContinue]);

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          A few more details
        </h2>
        <p className="text-muted-foreground mt-2">
          This helps us determine crew size
        </p>
      </div>

      {/* Both questions side by side on desktop, stacked on mobile */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Question 1: 2-Person Items (Size) */}
        <Card className="p-5">
          <h3 className="text-base font-medium text-foreground">
            Do any items require 2 people due to SIZE?
          </h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            e.g., sofa, desk, large wardrobe, bookshelf
          </p>

          <div className="space-y-3">
            <SelectionCard
              selected={needs2Person === false}
              onClick={() => setNeeds2Person(false)}
              title="No"
              description="All items can be carried by one person"
            />
            <SelectionCard
              selected={needs2Person === true}
              onClick={() => setNeeds2Person(true)}
              title="Yes"
              description="At least one item needs two people"
            />
          </div>
        </Card>

        {/* Question 2: Heavy Items (>40kg) */}
        <Card className="p-5">
          <h3 className="text-base font-medium text-foreground">
            Is any single item heavier than 40kg?
          </h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            e.g., washing machine, heavy wooden furniture
          </p>

          <div className="space-y-3">
            <SelectionCard
              selected={over40kg === false}
              onClick={() => setOver40kg(false)}
              title="No"
              description="Everything is under 40kg"
            />
            <SelectionCard
              selected={over40kg === true}
              onClick={() => setOver40kg(true)}
              title="Yes"
              description="At least one item is over 40kg"
            />
          </div>
        </Card>
      </div>

      {/* Summary */}
      {canContinue && (
        <Card className="p-4 bg-muted/50">
          <div className="text-sm font-medium text-foreground text-center">
            Estimated crew: {needs2Person || over40kg ? '2 movers' : '1 mover'}, 1 van
          </div>
        </Card>
      )}

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={onPrevious}
        onNext={onNext}
        canGoNext={canContinue}
        nextLabel="Continue"
      />
    </div>
  );
}

// ===================
// SUB-COMPONENTS
// ===================

interface SelectionCardProps {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}

function SelectionCard({ selected, onClick, title, description }: SelectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full p-4 rounded-lg border text-left transition-all',
        'hover:border-primary/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-primary bg-primary/5 ring-2 ring-primary'
          : 'border-border'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border-2',
          selected ? 'border-primary bg-primary' : 'border-muted-foreground'
        )}>
          {selected && (
            <span className="text-primary-foreground text-xs">✓</span>
          )}
        </div>
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
    </button>
  );
}

export default Step2FurnitureOnly;
