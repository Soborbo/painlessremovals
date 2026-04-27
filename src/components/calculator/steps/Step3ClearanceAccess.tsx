/**
 * STEP 3 (CLEARANCE): ACCESS DIFFICULTIES
 *
 * Image-based card selection for access factors that add percentage surcharges.
 * Matches the visual style of Step 6 complications.
 */

import { useState, useRef, useEffect } from 'react';
import { PictureImg } from '@/components/ui/picture-img';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setClearanceAccessDifficulties,
  nextStep,
  prevStep,
  type ClearanceAccessDifficulty,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { CONFIG } from '@/lib/config';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { cn } from '@/lib/utils';


type AccessKey = keyof typeof CALCULATOR_CONFIG.houseClearance.accessDifficulties;

const ACCESS_OPTIONS: Array<{
  id: AccessKey;
  title: string;
  percentage: number;
  image: string;
}> = [
  {
    id: 'restrictedParking',
    title: 'Restricted parking',
    percentage: 20,
    image: '/images/calculator/clearance/access/restricted-parking.jpg',
  },
  {
    id: 'upperFloorNoLift',
    title: 'Upper floor, no lift',
    percentage: 30,
    image: '/images/calculator/clearance/access/upper-floor.jpg',
  },
  {
    id: 'narrowDoors',
    title: 'Narrow doors',
    percentage: 10,
    image: '/images/calculator/clearance/access/narrow-doors.jpg',
  },
  {
    id: 'atticOrBasement',
    title: 'Attic or basement',
    percentage: 30,
    image: '/images/calculator/clearance/access/attic-basement.jpg',
  },
];

export function Step3ClearanceAccess() {
  const state = useStore(calculatorStore);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [selected, setSelected] = useState<ClearanceAccessDifficulty[]>(
    state.clearance?.accessDifficulties || []
  );
  const [noneSelected, setNoneSelected] = useState(
    state.clearance?.accessDifficulties !== undefined &&
    state.clearance?.accessDifficulties !== null &&
    state.clearance.accessDifficulties.length === 0 &&
    state.currentStep >= 3
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  // Handle toggle
  const handleToggle = (id: ClearanceAccessDifficulty) => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setNoneSelected(false);

    setSelected(prev => {
      if (prev.includes(id)) {
        return prev.filter(d => d !== id);
      }
      return [...prev, id];
    });
  };

  // Handle "None" toggle with auto-next
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
        setClearanceAccessDifficulties([]);
        nextStep();
      }, 300);
    }
  };

  // Handle continue
  const handleContinue = () => {
    setClearanceAccessDifficulties(selected);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Any access difficulties?
        </h2>
        <p className="text-muted-foreground mt-2">
          Select all that apply, or choose "No difficulties" if access is straightforward
        </p>
      </div>

      {/* Access difficulty cards - image-based like Step 6 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {ACCESS_OPTIONS.map((option) => {
          const isSelected = selected.includes(option.id);

          return (
            <div
              key={option.id}
              className={cn(
                'group relative cursor-pointer rounded-xl border-2 bg-card flex flex-col',
                'transition-all duration-300 ease-out',
                'border-border shadow-sm',
                !isSelected && 'hover:-translate-y-1 hover:scale-[1.02] hover:border-[#6a9c95]/50 hover:shadow-lg',
                isSelected && [
                  '-translate-y-1.5 scale-[1.03]',
                  'border-[#6a9c95] bg-[#6a9c95]/5',
                  'shadow-xl shadow-[#6a9c95]/10',
                  'ring-2 ring-[#6a9c95] ring-offset-2 ring-offset-background',
                ],
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a9c95] focus-visible:ring-offset-2'
              )}
              onClick={() => handleToggle(option.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle(option.id);
                }
              }}
              tabIndex={0}
              role="checkbox"
              aria-checked={isSelected}
            >
              {/* Selected check indicator */}
              <div
                className={cn(
                  'absolute -top-1 -right-1 z-10',
                  'flex h-7 w-7 items-center justify-center rounded-full',
                  'bg-emerald-500 text-white text-xs font-bold',
                  'shadow-lg shadow-emerald-500/30',
                  'transition-all duration-500',
                  isSelected
                    ? 'scale-100 opacity-100 animate-bounce-once'
                    : 'scale-0 opacity-0'
                )}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              {/* Image */}
              <div className="relative aspect-square w-full flex-none overflow-hidden rounded-t-lg">
                <PictureImg
                  src={`${CONFIG.site.assetBaseUrl}${option.image}`}
                  alt={option.title}
                  width={220}
                  height={220}
                  className={cn(
                    'h-full w-full object-cover',
                    'transition-transform duration-300 ease-out',
                    'group-hover:scale-110',
                    isSelected && 'scale-105'
                  )}
                  loading="lazy"
                />
              </div>

              {/* Title bar */}
              <div className="p-3 pt-2 text-center bg-[#6a9c95] rounded-b-lg flex-1 flex flex-col justify-center min-h-[3.5rem]">
                <h3 className="font-semibold text-sm text-white">
                  {option.title}
                </h3>
              </div>
            </div>
          );
        })}

        {/* No difficulties card */}
        <div
          className={cn(
            'group relative cursor-pointer rounded-xl border-2 bg-card flex flex-col',
            'transition-all duration-300 ease-out',
            'border-border shadow-sm',
            !noneSelected && 'hover:-translate-y-1 hover:scale-[1.02] hover:border-[#6a9c95]/50 hover:shadow-lg',
            noneSelected && [
              '-translate-y-1.5 scale-[1.03]',
              'border-[#6a9c95] bg-[#6a9c95]/5',
              'shadow-xl shadow-[#6a9c95]/10',
              'ring-2 ring-[#6a9c95] ring-offset-2 ring-offset-background',
            ],
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a9c95] focus-visible:ring-offset-2'
          )}
          onClick={handleNoneToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNoneToggle();
            }
          }}
          tabIndex={0}
          role="checkbox"
          aria-checked={noneSelected}
        >
          {/* Selected check indicator */}
          <div
            className={cn(
              'absolute -top-1 -right-1 z-10',
              'flex h-7 w-7 items-center justify-center rounded-full',
              'bg-emerald-500 text-white text-xs font-bold',
              'shadow-lg shadow-emerald-500/30',
              'transition-all duration-500',
              noneSelected
                ? 'scale-100 opacity-100 animate-bounce-once'
                : 'scale-0 opacity-0'
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          {/* Image */}
          <div className="relative aspect-square w-full flex-none overflow-hidden rounded-t-lg">
            <PictureImg
              src={`${CONFIG.site.assetBaseUrl}/images/calculator/clearance/access/no-difficulties.jpg`}
              alt="No access difficulties"
              width={220}
              height={220}
              className={cn(
                'h-full w-full object-cover',
                'transition-transform duration-300 ease-out',
                'group-hover:scale-110',
                noneSelected && 'scale-105'
              )}
              loading="lazy"
            />
          </div>

          {/* Title bar */}
          <div className="p-3 pt-2 text-center bg-[#6a9c95] rounded-b-lg flex-1 flex flex-col justify-center min-h-[3.5rem]">
            <h3 className="font-semibold text-sm text-white">
              No difficulties
            </h3>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        canGoNext={selected.length > 0 || noneSelected}
        nextLabel="Continue"
      />
    </div>
  );
}

export default Step3ClearanceAccess;
