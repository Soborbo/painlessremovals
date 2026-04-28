/**
 * CALCULATOR APP
 * 
 * Main React component for calculator
 * This will be used in future for client-side routing
 */

import * as React from 'react';
import { useStore } from '@nanostores/react';

import { $currentStepId, setStep } from '@/lib/core/calculator/store';
import { getStepById, getNextStep, getPreviousStep } from '@/lib/core/calculator/config';
import { Step01Example } from '@/components/calculator/steps/step-01-example';
import { StepSummary } from '@/components/calculator/steps/step-summary';

export const CalculatorApp: React.FC = () => {
  const currentStepId = useStore($currentStepId);
  const currentStep = getStepById(currentStepId);

  const handleNext = React.useCallback(() => {
    const next = getNextStep(currentStepId);
    if (next) {
      setStep(next.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStepId]);

  const handlePrevious = React.useCallback(() => {
    const prev = getPreviousStep(currentStepId);
    if (prev) {
      setStep(prev.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStepId]);

  const handleSubmit = React.useCallback(async () => {
    // For now, just redirect to thank you page
    window.location.href = '/instantquote/thank-you/?id=123';
  }, []);

  // Render appropriate step component
  const renderStep = () => {
    switch (currentStepId) {
      case 'step-01':
        return <Step01Example onNext={handleNext} />;

      case 'summary':
        return <StepSummary onPrevious={handlePrevious} onSubmit={handleSubmit} />;

      default:
        return (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Step component not implemented yet</p>
          </div>
        );
    }
  };

  if (!currentStep) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Invalid step</p>
      </div>
    );
  }

  return <>{renderStep()}</>;
};
