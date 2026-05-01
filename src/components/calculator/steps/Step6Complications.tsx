/**
 * STEP 6: COMPLICATING FACTORS (v4.2 — Point System)
 *
 * Point-based system replaces percentage multipliers:
 * - Stairs 2nd+ no lift: 2 points
 * - Restricted access: 2 points
 * - Narrow doors: 1 point
 * - No lift: 1 point
 * - Heavy items: 1 point
 * - Plants 20+: +1 van, +1 man (separate from points)
 *
 * Points → extra crew: 0-1pt: +0, 2-3pt: +1, 4-5pt: +2, 6+: free survey
 */

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setComplications,
  nextStep,
  prevStep,
} from '@/lib/calculator-store';
import type { Complication } from '@/lib/calculator-config';
import { applyComplications } from '@/lib/calculator-logic';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { getImageSources, type CalcImageKey } from '@/lib/calculator-images';

// Complication options with details — v4.2 point system
const complicationOptions: Array<{
  id: Complication;
  title: string;
  subtitle?: string;
  imageKey: CalcImageKey;
}> = [
  {
    id: 'stairs2ndNoLift',
    title: 'Stairs (2nd+ floor)',
    imageKey: 'step6-stairs',
  },
  {
    id: 'restrictedAccess',
    title: 'Restricted access',
    imageKey: 'step6-access',
  },
  {
    id: 'narrowDoors',
    title: 'Narrow doors/hallways',
    imageKey: 'step6-attic',
  },
  {
    id: 'noLift',
    title: 'No lift available',
    imageKey: 'step6-elevator',
  },
  {
    id: 'heavyItems',
    title: 'Heavy/oversize items',
    imageKey: 'step6-large',
  },
  {
    id: 'plants',
    title: 'Large plant collection',
    imageKey: 'step6-plants',
  },
];

export function Step6Complications() {
  const state = useStore(calculatorStore);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [selected, setSelected] = useState<Complication[]>(
    state.complications || []
  );
  // Default-enable "No complications" on fresh visits so Continue is never
  // a dead button. Matches Step3ClearanceAccess. Returning users with picks
  // get noneSelected=false because complications.length > 0.
  const [noneSelected, setNoneSelected] = useState(
    (state.complications === null ||
      state.complications === undefined ||
      state.complications.length === 0) &&
    state.currentStep >= 6
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  // Calculate points impact for current selection
  const complicationResult = applyComplications(selected);

  // Handle complication toggle
  const handleToggle = (id: Complication) => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setNoneSelected(false);

    setSelected(prev => {
      if (prev.includes(id)) {
        return prev.filter(c => c !== id);
      }
      return [...prev, id];
    });
  };

  // Handle "None of these" toggle with auto-next
  const handleNoneToggle = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    if (noneSelected) {
      setNoneSelected(false);
    } else {
      setNoneSelected(true);
      setSelected([]);

      navigationTimeoutRef.current = setTimeout(() => {
        navigationTimeoutRef.current = null;
        setComplications([]);
        nextStep();
      }, 300);
    }
  };

  // Handle continue
  const handleContinue = () => {
    setComplications(selected);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <p className="text-muted-foreground mt-2">
          Select all that apply, or choose "No complicating factors" if none apply
        </p>
      </div>

      {/* Survey recommendation for high points */}
      {selected.length > 0 && complicationResult.requiresSurvey && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            <span>We recommend a free video survey for the best quote</span>
          </div>
        </div>
      )}

      {/* Complication Options */}
      <SelectionCardGrid columns={{ default: 2, sm: 4, md: 4, lg: 4 }}>
        {complicationOptions.map((option) => {
          return (
            <SelectionCard
              key={option.id}
              value={option.id}
              title={option.title}
              subtitle={option.subtitle}
              imageConfig={getImageSources(option.imageKey)}
              isSelected={selected.includes(option.id)}
              onSelect={() => handleToggle(option.id)}
            />
          );
        })}

        {/* None of these */}
        <SelectionCard
          value="none"
          title="No complications"
          imageConfig={getImageSources('step6-none')}
          isSelected={noneSelected}
          onSelect={handleNoneToggle}
        />
      </SelectionCardGrid>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        canGoNext={selected.length > 0 || noneSelected}
        nextLabel="Continue"
      />
    </div>
  );
}

export default Step6Complications;
