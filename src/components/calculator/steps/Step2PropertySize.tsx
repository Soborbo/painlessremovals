/**
 * STEP 2: PROPERTY SIZE SELECTION
 *
 * Branches:
 * - Home: 9 property size options
 * - Office: 3 office size options
 * - Furniture: Shows Step2FurnitureOnly inline
 */

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setPropertySize,
  setOfficeSize,
  nextStep,
  prevStep,
  goToStep,
} from '@/lib/calculator-store';
import type { PropertySize, OfficeSize } from '@/lib/calculator-config';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { Step2FurnitureOnly } from './Step2FurnitureOnly';
import { Step2ClearanceItems } from './Step2ClearanceItems';
import { getImageSources, type CalcImageKey } from '@/lib/calculator-images';

// ===================
// MAIN COMPONENT
// ===================

export function Step2PropertySize() {
  const state = useStore(calculatorStore);
  const [isReady, setIsReady] = useState(false);

  // Wait one tick for the store to hydrate from localStorage
  // so we don't flash HomePropertySelection before switching to OfficeSelection
  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  // Clearance branch
  if (state.serviceType === 'clearance') {
    return <Step2ClearanceItems />;
  }

  // Office branch
  if (state.serviceType === 'office') {
    return <OfficeSelection />;
  }

  // Furniture Only branch - show FurnitureOnly component if already selected
  if (state.propertySize === 'furniture') {
    return <Step2FurnitureOnly />;
  }

  // Home branch (default)
  return <HomePropertySelection />;
}

// ===================
// HOME PROPERTY SELECTION
// ===================

const propertyOptions: Array<{
  value: PropertySize;
  label: string;
  imageKey: CalcImageKey;
}> = [
  { value: 'furniture', label: 'Furniture Only', imageKey: 'step2-furniture' },
  { value: 'studio', label: 'Studio', imageKey: 'step2-studio' },
  { value: '1bed', label: '1 Bedroom', imageKey: 'step2-1bed' },
  { value: '2bed', label: '2 Bedrooms', imageKey: 'step2-2bed' },
  { value: '3bed-small', label: '3 Bed (Small)', imageKey: 'step2-3bed-small' },
  { value: '3bed-large', label: '3 Bed (Large)', imageKey: 'step2-3bed-large' },
  { value: '4bed', label: '4 Bedrooms', imageKey: 'step2-4bed' },
  { value: '5bed', label: '5 Bedrooms', imageKey: 'step2-5bed' },
  { value: '5bed-plus', label: '5+ Bedrooms', imageKey: 'step2-5bed-plus' },
];

function HomePropertySelection() {
  const state = useStore(calculatorStore);
  const [selectedSize, setSelectedSizeLocal] = useState<PropertySize | null>(state.propertySize);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (size: PropertySize) => {
    // Clear any pending navigation timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setSelectedSizeLocal(size);
    setPropertySize(size);

    // Furniture Only → show the FurnitureOnly form (no navigation, just re-render)
    if (size === 'furniture') {
      // The component will re-render and show Step2FurnitureOnly
      return;
    }

    // Auto-next after selection for other property types
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;

      // Studio → skip belongings slider (fixed 250 cubes)
      if (size === 'studio') {
        goToStep(4);
        return;
      }

      // All others → belongings slider (Step 3)
      nextStep();
    }, 300);
  };

  const handleNext = () => {
    if (!selectedSize) return;

    // Furniture Only - just set the property size, component will re-render
    if (selectedSize === 'furniture') {
      setPropertySize(selectedSize);
      return;
    }

    if (selectedSize === 'studio') {
      goToStep(4);
      return;
    }

    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          What size is your current home?
        </h2>
        <p className="text-muted-foreground mt-2">
          This helps us estimate what you'll need
        </p>
      </div>

      {/* Property Cards - Grid: 2 cols mobile, 3 cols desktop */}
      <SelectionCardGrid columns={{ default: 2, sm: 2, md: 3 }}>
        {propertyOptions.map((option) => (
          <SelectionCard
            key={option.value}
            value={option.value}
            title={option.label}
            imageConfig={getImageSources(option.imageKey)}
            isSelected={selectedSize === option.value}
            onSelect={() => handleSelect(option.value)}
          />
        ))}
      </SelectionCardGrid>

      {/* Help text */}
      <p className="text-center text-sm text-muted-foreground">
        Not sure? Pick the closest match - you can adjust later.
      </p>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleNext}
        canGoNext={!!selectedSize}
        nextLabel="Continue"
      />
    </div>
  );
}

// ===================
// OFFICE SELECTION
// ===================

const officeOptions: Array<{
  value: OfficeSize;
  label: string;
  description: string;
  imageKey: CalcImageKey;
}> = [
  { value: 'small', label: 'Small Office', description: '1-5 desks, minimal equipment', imageKey: 'step2-office-small' },
  { value: 'medium', label: 'Medium Office', description: '6-15 desks, standard equipment', imageKey: 'step2-office-medium' },
  { value: 'large', label: 'Large Office', description: '16+ desks, server room, heavy equipment', imageKey: 'step2-office-large' },
];

function OfficeSelection() {
  const state = useStore(calculatorStore);
  const [selectedSize, setSelectedSizeLocal] = useState<OfficeSize | null>(state.officeSize);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (size: OfficeSize) => {
    // Clear any pending navigation timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setSelectedSizeLocal(size);
    setOfficeSize(size);

    // Auto-next after selection
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;
      goToStep(5);
    }, 300);
  };

  const handleNext = () => {
    if (!selectedSize) return;
    goToStep(5);
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          What size is your office?
        </h2>
        <p className="text-muted-foreground mt-2">
          We'll tailor our service to your business needs
        </p>
      </div>

      {/* Office Cards - 2 cols on mobile, 3 on desktop */}
      <SelectionCardGrid columns={{ default: 2, sm: 2, md: 3 }}>
        {officeOptions.map((option) => (
          <SelectionCard
            key={option.value}
            value={option.value}
            title={option.label}
            imageConfig={getImageSources(option.imageKey)}
            isSelected={selectedSize === option.value}
            onSelect={() => handleSelect(option.value)}
          />
        ))}
      </SelectionCardGrid>

      {/* Note */}
      <p className="text-center text-sm text-muted-foreground">
        Need a larger office move? We'll call you to discuss details.
      </p>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleNext}
        canGoNext={!!selectedSize}
        nextLabel="Continue"
      />
    </div>
  );
}

export default Step2PropertySize;
