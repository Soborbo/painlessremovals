/**
 * STEP 4: RECOMMENDATION DISPLAY
 *
 * Shows recommended vans/movers based on calculations.
 * Options:
 * 1. Accept recommendation → Continue
 * 2. Adjust belongings → Go back to slider
 * 3. Manual override → Select specific vans/movers
 */

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  calculatedCubes,
  recommendedResources,
  requiresCallback,
  setManualOverride,
  clearManualOverride,
  nextStep,
  prevStep,
  goToStep,
} from '@/lib/calculator-store';
import { validateVanCrew, checkRecommendationDiff } from '@/lib/calculator-logic';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export function Step4Recommendation() {
  const state = useStore(calculatorStore);
  const cubes = useStore(calculatedCubes);
  const resources = useStore(recommendedResources);
  const callbackRequired = useStore(requiresCallback);

  const [showManualOverride, setShowManualOverride] = useState(false);
  const [manualVans, setManualVans] = useState(resources?.vans ?? 2);
  const [manualMen, setManualMen] = useState(resources?.men ?? 2);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle accept recommendation
  const handleAccept = () => {
    clearManualOverride();
    nextStep();
  };

  // Handle go back to adjust belongings
  const handleAdjustBelongings = () => {
    prevStep(); // Go back to slider
  };

  // Handle manual override submission
  const handleManualSubmit = () => {
    // Validate
    const validation = validateVanCrew(manualVans, manualMen);
    if (!validation.valid) {
      setValidationError(validation.message || 'Invalid selection');
      return;
    }

    setValidationError(null);
    setManualOverride(manualMen, manualVans);
    nextStep();
  };

  // Get property label
  const propertyLabel = CALCULATOR_CONFIG.propertySizeOptions.find(
    p => p.value === state.propertySize
  )?.label || 'your property';

  const sliderLabel = CALCULATOR_CONFIG.sliderModifiers[state.sliderPosition]?.label || 'average';

  // If callback required (>2000 cubes or specialist items)
  if (callbackRequired.required) {
    return <CallbackRequiredView {...(callbackRequired.reason !== undefined && { reason: callbackRequired.reason })} />;
  }

  // If no resources calculated yet
  if (!resources) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Calculating recommendation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Here's what we recommend
        </h2>
        <p className="text-muted-foreground mt-2">
          Based on your {propertyLabel} with {sliderLabel.toLowerCase()} belongings
        </p>
      </div>

      {/* Recommendation Card */}
      <Card className="p-6 bg-gradient-to-b from-primary/5 to-transparent border-primary/20">
        <div className="text-center space-y-4">
          {/* Visual */}
          <div className="flex justify-center gap-8">
            {/* Vans */}
            <div className="text-center">
              <div className="text-4xl mb-2">
                {Array.from({ length: Math.min(resources.vans, 4) }).map((_, i) => (
                  <span key={i}>🚚</span>
                ))}
                {resources.vans > 4 && <span className="text-2xl">+{resources.vans - 4}</span>}
              </div>
              <div className="text-2xl font-bold text-foreground">
                {resources.vans} Van{resources.vans > 1 ? 's' : ''}
              </div>
              <div className="text-sm text-muted-foreground">Luton vans with tail lift</div>
            </div>

            {/* Movers */}
            <div className="text-center">
              <div className="text-4xl mb-2">
                {Array.from({ length: Math.min(resources.men, 6) }).map((_, i) => (
                  <span key={i}>👷</span>
                ))}
                {resources.men > 6 && <span className="text-2xl">+{resources.men - 6}</span>}
              </div>
              <div className="text-2xl font-bold text-foreground">
                {resources.men} Mover{resources.men > 1 ? 's' : ''}
              </div>
              <div className="text-sm text-muted-foreground">Professional team</div>
            </div>
          </div>

          {/* Cubes info */}
          <p className="text-sm text-muted-foreground">
            Estimated volume: ~{cubes.toLocaleString()} cubic feet
          </p>
        </div>
      </Card>

      {/* Action Buttons */}
      {!showManualOverride ? (
        <div className="space-y-3">
          {/* Primary: Accept */}
          <Button
            onClick={handleAccept}
            className="w-full"
            size="lg"
          >
            Accept this recommendation
          </Button>

          {/* Secondary: Adjust belongings */}
          <Button
            onClick={handleAdjustBelongings}
            variant="outline"
            className="w-full"
          >
            I have fewer/more belongings than I thought
          </Button>

          {/* Tertiary: Manual override */}
          <Button
            onClick={() => setShowManualOverride(true)}
            variant="ghost"
            className="w-full text-muted-foreground"
          >
            I have a specific requirement
          </Button>
        </div>
      ) : (
        /* Manual Override Panel */
        <ManualOverridePanel
          vans={manualVans}
          men={manualMen}
          recommendedVans={resources.vans}
          recommendedMen={resources.men}
          onVansChange={setManualVans}
          onMenChange={setManualMen}
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManualOverride(false)}
          validationError={validationError}
        />
      )}

    </div>
  );
}

// ===================
// MANUAL OVERRIDE PANEL
// ===================

interface ManualOverridePanelProps {
  vans: number;
  men: number;
  recommendedVans: number;
  recommendedMen: number;
  onVansChange: (v: number) => void;
  onMenChange: (m: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  validationError: string | null;
}

function ManualOverridePanel({
  vans,
  men,
  recommendedVans,
  recommendedMen,
  onVansChange,
  onMenChange,
  onSubmit,
  onCancel,
  validationError,
}: ManualOverridePanelProps) {
  const diff = checkRecommendationDiff(
    { men: recommendedMen, vans: recommendedVans, workTime: 0, cuft: 0 },
    { men, vans }
  );

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-foreground">
          What are your specific requirements?
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Another company assessed your home, or you know exactly what you need
        </p>
      </div>

      {/* Van selector */}
      <div>
        <label className="text-sm font-medium text-foreground">
          How many vans do you need?
        </label>
        <div className="flex gap-2 mt-2">
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onVansChange(v)}
              className={cn(
                'w-12 h-12 rounded-lg border-2 font-semibold transition-all',
                'hover:border-primary/50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                vans === v
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Men selector */}
      <div>
        <label className="text-sm font-medium text-foreground">
          How many movers do you need?
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMenChange(m)}
              className={cn(
                'w-12 h-12 rounded-lg border-2 font-semibold transition-all',
                'hover:border-primary/50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                men === m
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground'
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Validation error */}
      {validationError && (
        <Alert variant="destructive">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {/* Difference warning */}
      {diff.differs && !validationError && (
        <Alert className="border-amber-500 bg-amber-50">
          <AlertDescription className="text-amber-800">
            <strong>Just so you know...</strong>
            <br />
            {diff.message}
            <br />
            <span className="text-sm">That's fine if another company assessed your home - just wanted to check!</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          className="flex-1"
        >
          Continue with my selection
        </Button>
      </div>
    </Card>
  );
}

// ===================
// CALLBACK REQUIRED VIEW
// ===================

interface CallbackRequiredViewProps {
  reason?: string;
}

function CallbackRequiredView({ reason }: CallbackRequiredViewProps) {
  const handleRequestCallback = () => {
    goToStep(11); // Go to contact details
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Let's talk about your move
        </h2>
        <p className="text-muted-foreground mt-2">
          {reason === 'specialist_items'
            ? 'Specialist items require a custom quote'
            : 'Large properties like yours need a personalized assessment'
          }
        </p>
      </div>

      <Card className="p-6 text-center bg-primary/5 border-primary/20">
        <div className="text-5xl mb-4">📞</div>
        <h3 className="text-xl font-semibold text-foreground">
          We'll call you soon
        </h3>
        <p className="text-muted-foreground mt-2">
          During business hours (Mon-Sat 8am-6pm)
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Our team will discuss your specific requirements and provide an accurate, no-obligation quote.
        </p>
      </Card>

      <Alert>
        <AlertDescription>
          <strong>Why can't we quote online?</strong>
          <br />
          {reason === 'specialist_items'
            ? 'Specialist items like pianos, safes, or gym equipment require special equipment and expertise. We need to understand exactly what you have to ensure we send the right team.'
            : 'Properties over a certain size vary significantly in load volume. A quick call helps us give you an accurate price rather than a rough estimate.'
          }
        </AlertDescription>
      </Alert>

      <Button
        onClick={handleRequestCallback}
        className="w-full"
        size="lg"
      >
        Request a Callback
      </Button>
    </div>
  );
}

export default Step4Recommendation;
