/**
 * NAVIGATION BUTTONS
 * 
 * Previous/Next buttons for calculator steps
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavigationButtonsProps {
  onPrevious?: () => void;
  onNext?: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  showNext?: boolean;
  isLastStep?: boolean;
  isLoading?: boolean;
  nextLabel?: string;
  previousLabel?: string;
  className?: string;
}

export const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  onPrevious,
  onNext,
  canGoPrevious = true,
  canGoNext = true,
  showNext = true,
  isLastStep = false,
  isLoading = false,
  nextLabel,
  previousLabel = 'Previous',
  className,
}) => {
  const defaultNextLabel = isLastStep ? 'Get Quote' : 'Next Step';
  const finalNextLabel = nextLabel || defaultNextLabel;

  return (
    <div className={cn('flex justify-between gap-4', className)}>
      {/* Previous Button */}
      {onPrevious && (
        <Button
          type="button"
          variant="outline"
          onClick={onPrevious}
          disabled={!canGoPrevious || isLoading}
          className="min-w-[120px]"
        >
          ← {previousLabel}
        </Button>
      )}

      {/* Spacer if no previous button */}
      {!onPrevious && <div />}

      {/* Next Button */}
      {showNext && onNext && (
        <Button
          type="button"
          onClick={onNext}
          disabled={!canGoNext || isLoading}
          className="min-w-[120px]"
        >
          {isLoading ? (
            <>
              <span className="inline-block animate-spin mr-2">⏳</span>
              Loading...
            </>
          ) : (
            <>{finalNextLabel} →</>
          )}
        </Button>
      )}
    </div>
  );
};
