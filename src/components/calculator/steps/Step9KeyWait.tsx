/**
 * STEP 9: KEY WAIT WAIVER
 *
 * Insurance-style add-on that protects the customer from overtime charges
 * if the move runs over due to delays outside their control (e.g. property
 * chain hold-ups, solicitor delays, late key release).
 *
 * Cost = number of movers × ratePerMover (≈ 2 hours of crew wages).
 * The waiver does NOT cover a second day or work beyond 5pm cutoff.
 */

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setKeyWaitWaiver,
  nextStep,
  prevStep,
  finalResources,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { Card } from '@/components/ui/card';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { getImageSources } from '@/lib/calculator-images';

export function Step9KeyWait() {
  const state = useStore(calculatorStore);
  const resources = useStore(finalResources);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [wantsWaiver, setWantsWaiver] = useState<boolean | null>(
    state.keyWaitWaiver
  );
  const [showExplanation, setShowExplanation] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const men = resources?.men ?? 2;
  const ratePerMover = CALCULATOR_CONFIG.keyWaitWaiver.ratePerMover;
  const totalCost = men * ratePerMover;

  const handleSelect = (value: boolean) => {
    // Clear any pending navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setWantsWaiver(value);

    // Auto-navigate after short delay
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;
      setKeyWaitWaiver(value);
      nextStep();
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Add a Key Wait Waiver?
        </h2>
        <p className="text-muted-foreground mt-2">
          A small, fixed fee that protects you from overtime charges if your move runs over due to delays you can't control
        </p>
      </div>

      {/* Options - 2 cols */}
      <SelectionCardGrid columns={{ default: 2, sm: 2, md: 2 }} className="max-w-xl mx-auto">
        <SelectionCard
          value="yes"
          title="Yes, protect my move"
          subtitle={`+£${totalCost}`}
          imageConfig={getImageSources('step9-keywait-yes')}
          isSelected={wantsWaiver === true}
          onSelect={() => handleSelect(true)}
        />
        <SelectionCard
          value="no"
          title="No thanks, I'll skip it"
          imageConfig={getImageSources('step9-keywait-no')}
          isSelected={wantsWaiver === false}
          onSelect={() => handleSelect(false)}
        />
      </SelectionCardGrid>

      {/* More info helper */}
      <div className="text-center">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground underline"
          onClick={() => setShowExplanation(!showExplanation)}
        >
          What does the Key Wait Waiver cover?
        </button>
      </div>

      {/* Explanation */}
      {showExplanation && (
        <Card className="p-4 bg-muted/50 space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Chains collapse. Solicitors run late. Keys don't arrive on time.</strong> If your move runs beyond the quoted hours for reasons outside your control, there are normally additional overtime charges. The Key Wait Waiver removes those charges entirely.
          </p>
          <p className="text-sm text-muted-foreground">
            Think of it as <strong className="text-foreground">moving day insurance</strong> — a small, fixed cost upfront so you don't face a surprise bill at the end of a stressful day.
          </p>
          <p className="text-sm text-muted-foreground">
            The fee is based on just under <strong className="text-foreground">2 hours of your {men}-person crew's wages</strong>, totalling <strong className="text-foreground">£{totalCost}</strong>. Without the waiver, overtime could cost significantly more.
          </p>
          <div className="text-xs text-muted-foreground/70 border-t pt-2 mt-2">
            <p>The waiver does not cover: a second day of removal, work beyond our 5pm cutoff, or additional items not in the original quote. If a delay is our fault, you won't be charged extra regardless — waiver or not.</p>
          </div>
        </Card>
      )}

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        showNext={false}
      />
    </div>
  );
}

export default Step9KeyWait;
