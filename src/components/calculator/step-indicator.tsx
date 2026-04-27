/**
 * STEP INDICATOR
 * 
 * Simple step indicator (alternative to progress bar)
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  className?: string;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  totalSteps,
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={cn(
            'h-2 flex-1 rounded-full transition-colors',
            step <= currentStep ? 'bg-primary' : 'bg-secondary'
          )}
        />
      ))}
    </div>
  );
};
