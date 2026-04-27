/**
 * PROGRESS BAR (React)
 *
 * Interactive progress bar with:
 * - Dynamic steps based on flow (furniture, office, home)
 * - Clickable steps (completed steps only)
 * - Scrollable on mobile with current step centered
 * - Brand color #035349
 */

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { CALCULATOR_STEPS } from '@/lib/core/calculator/config';
import { calculatorStore, applicableSteps, goToStep } from '@/lib/calculator-store';
import { cn } from '@/lib/utils';

interface ProgressBarReactProps {
  currentStep: number;
  className?: string;
}

const BRAND_COLOR = '#035349';

// Default steps for SSR (full flow)
const DEFAULT_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const ProgressBarReact: React.FC<ProgressBarReactProps> = ({
  currentStep,
  className,
}) => {
  const state = useStore(calculatorStore);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentStepRef = useRef<HTMLButtonElement>(null);

  // Use state to avoid hydration mismatch - start with default steps
  const [steps, setSteps] = useState<number[]>(DEFAULT_STEPS);
  const [isHydrated, setIsHydrated] = useState(false);

  // Update steps after hydration when store is ready
  // Defer step recalculation while on step 1 to avoid layout jump
  // when the user selects a service type (e.g. office → fewer steps)
  useEffect(() => {
    setIsHydrated(true);
    if (state.currentStep > 1) {
      setSteps(applicableSteps.get());
    }
  }, [state.currentStep, state.propertySize, state.serviceType]);

  const totalSteps = steps.length;

  // Find current position in the flow
  const currentIndex = steps.indexOf(currentStep);
  const progress = currentIndex >= 0 ? Math.round(((currentIndex + 1) / totalSteps) * 100) : 0;

  // Get step config for each applicable step
  const displaySteps = steps.map((stepNum, index) => {
    const stepConfig = CALCULATOR_STEPS.find(s => s.order === stepNum);
    return {
      order: stepNum,
      displayOrder: index + 1,
      title: stepConfig?.title.en || `Step ${stepNum}`,
      id: stepConfig?.id || `step-${stepNum}`,
    };
  });

  // Scroll to center current step on mobile
  useEffect(() => {
    if (currentStepRef.current && scrollContainerRef.current && isHydrated) {
      const container = scrollContainerRef.current;
      const stepElement = currentStepRef.current;

      const containerWidth = container.offsetWidth;
      const stepLeft = stepElement.offsetLeft;
      const stepWidth = stepElement.offsetWidth;
      const scrollPosition = stepLeft - (containerWidth / 2) + (stepWidth / 2);

      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth',
      });
    }
  }, [currentStep, isHydrated]);

  // Allow navigating to any previously visited step (not just steps before current)
  const highestReached = state.highestStepReached || currentStep;
  const highestReachedIndex = steps.indexOf(highestReached);

  const handleStepClick = (stepOrder: number) => {
    const clickedIndex = steps.indexOf(stepOrder);
    // Allow clicking any step up to the highest step the user has reached
    if (clickedIndex >= 0 && clickedIndex !== currentIndex && clickedIndex <= highestReachedIndex) {
      goToStep(stepOrder);
    }
  };

  return (
    <div className={cn('w-full min-h-[52px]', className)}>
      {/* Linear progress bar */}
      <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div
          className="absolute top-0 left-0 h-full transition-all duration-500 ease-out rounded-full"
          style={{
            width: `${progress}%`,
            backgroundColor: BRAND_COLOR,
          }}
        />
      </div>

      {/* Step indicators - scrollable on mobile */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <div className="flex gap-1 md:gap-2 min-w-max md:min-w-0 md:justify-between py-1">
          {displaySteps.map((step, index) => {
            const stepIndex = index;
            const isCompleted = stepIndex < currentIndex;
            const isCurrent = step.order === currentStep;
            const isFuture = stepIndex > currentIndex;
            const isVisited = stepIndex <= highestReachedIndex && !isCurrent;
            const isClickable = isVisited;

            return (
              <button
                key={step.id}
                ref={isCurrent ? currentStepRef : undefined}
                onClick={() => handleStepClick(step.order)}
                disabled={!isClickable}
                className={cn(
                  'flex flex-col items-center min-w-[60px] md:min-w-0 md:flex-1 transition-all duration-200',
                  isClickable && 'cursor-pointer hover:opacity-80',
                  !isClickable && 'cursor-default'
                )}
                aria-label={`${step.title} - Step ${step.displayOrder}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
              >
                {/* Step circle */}
                <div
                  className={cn(
                    'w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-semibold transition-all duration-200',
                    isCurrent && 'ring-3 ring-opacity-30 scale-110',
                  )}
                  style={{
                    backgroundColor: isCompleted || isCurrent || isVisited ? BRAND_COLOR : '#E5E7EB',
                    color: isCompleted || isCurrent || isVisited ? 'white' : '#9CA3AF',
                    '--tw-ring-color': isCurrent ? BRAND_COLOR : undefined,
                  } as React.CSSProperties}
                >
                  {isCompleted || (isVisited && !isCurrent) ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.displayOrder
                  )}
                </div>

                {/* Step label */}
                <span
                  className={cn(
                    'text-[9px] md:text-[11px] mt-1 text-center whitespace-nowrap',
                    isCurrent && 'font-semibold',
                    isFuture && !isVisited && 'opacity-50'
                  )}
                  style={{
                    color: isCompleted || isCurrent || isVisited ? BRAND_COLOR : '#6B7280',
                  }}
                >
                  {step.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hide scrollbar styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default ProgressBarReact;
