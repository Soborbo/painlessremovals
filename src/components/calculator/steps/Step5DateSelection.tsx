/**
 * STEP 5: DATE FLEXIBILITY SELECTION
 *
 * Options:
 * 1. Fixed date - completion day, must be this date
 * 2. Flexible date - preferred date but can adjust
 * 3. Unknown - don't know yet
 *
 * If fixed/flexible selected, advances to Step 5b for date picker.
 */

import { useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setDate,
  nextStep,
  prevStep,
  type DateFlexibility,
} from '@/lib/calculator-store';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { getImageSources, type CalcImageKey } from '@/lib/calculator-images';


// Date flexibility options
const flexibilityOptions: Array<{
  value: DateFlexibility;
  label: string;
  description: string;
  imageKey: CalcImageKey;
  needsDate: boolean;
  badge?: string;
}> = [
  {
    value: 'fixed',
    label: 'I have a fixed date',
    description: 'Completion day, notice period ending, etc.',
    imageKey: 'step5-fixed',
    needsDate: true,
  },
  {
    value: 'flexible',
    label: "I'm flexible with dates",
    description: 'We can find the best available slot for you',
    imageKey: 'step5-flexible',
    needsDate: true,
    badge: 'Better prices!',
  },
  {
    value: 'unknown',
    label: 'Just exploring options',
    description: "Get a quote to plan your budget",
    imageKey: 'step5-exploring',
    needsDate: false,
  },
];

export function Step5DateSelection() {
  const state = useStore(calculatorStore);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleFlexibilitySelect = (option: DateFlexibility) => {
    // Clear any pending navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    // Auto-navigate after short delay
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;

      if (option === 'unknown') {
        // No date needed, save and go to next main step
        setDate('unknown', undefined);
        nextStep();
      } else {
        // Save flexibility and go to date picker step
        setDate(option, undefined);
        // Navigate to step 5b (calendar)
        if (typeof window !== 'undefined') {
          window.location.href = '/instantquote/step-5b/';
        }
      }
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          When do you need to move?
        </h2>
        <p className="text-muted-foreground mt-2">
          This helps us check availability and give you an accurate quote
        </p>
      </div>

      {/* Flexibility Options - 3 columns on desktop */}
      <SelectionCardGrid columns={{ default: 1, sm: 3, md: 3, lg: 3 }}>
        {flexibilityOptions.map((option) => (
          <SelectionCard
            key={option.value}
            value={option.value}
            title={option.label}
            imageConfig={getImageSources(option.imageKey)}
            isSelected={state.dateFlexibility === option.value}
            onSelect={() => handleFlexibilitySelect(option.value)}
            {...(option.badge !== undefined && { badge: option.badge })}
            badgeVariant="warning"
            badgePosition="top"
          />
        ))}
      </SelectionCardGrid>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        showNext={false}
      />
    </div>
  );
}

export default Step5DateSelection;
