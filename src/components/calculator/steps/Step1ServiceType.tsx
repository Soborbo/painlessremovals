/**
 * STEP 1: SERVICE TYPE SELECTION
 *
 * User selects: Home Removal | Office Removal | Clearance Service
 */

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setServiceType,
  nextStep,
  type ServiceType
} from '@/lib/calculator-store';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { CONFIG } from '@/lib/config';
import { getImageSources, type CalcImageKey } from '@/lib/calculator-images';

const serviceOptions: Array<{
  value: ServiceType;
  label: string;
  imageKey: CalcImageKey;
}> = [
  { value: 'home', label: 'Home Removal', imageKey: 'step1-home' },
  { value: 'office', label: 'Office Removal', imageKey: 'step1-office' },
  { value: 'clearance', label: 'Clearance Service', imageKey: 'step1-clearance' },
];


export function Step1ServiceType() {
  const state = useStore(calculatorStore);
  const [selectedType, setSelectedTypeLocal] = useState<ServiceType | null>(state.serviceType);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (type: ServiceType) => {
    // Clear any pending navigation timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setSelectedTypeLocal(type);
    setServiceType(type);

    // Auto-next after selection
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;
      nextStep();
    }, 300);
  };

  const handleCallbackSelect = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    window.location.href = '/instantquote/simple-callback/';
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          What type of service do you need?
        </h2>
        <p className="text-muted-foreground mt-2">
          Select one to get started with your instant quote
        </p>
      </div>

      {/* Service Cards - 4 in a row */}
      <SelectionCardGrid columns={{ default: 2, sm: 4 }}>
        {serviceOptions.map((option) => (
          <SelectionCard
            key={option.value}
            value={option.value}
            title={option.label}
            imageConfig={getImageSources(option.imageKey)}
            isSelected={selectedType === option.value}
            onSelect={() => handleSelect(option.value)}
            loading="eager"
            fetchPriority="high"
          />
        ))}
        <SelectionCard
          value="callback"
          title="Not sure? Get a callback"
          imageUrl={`${CONFIG.site.assetBaseUrl}/images/email/jay.webp`}
          isSelected={false}
          onSelect={handleCallbackSelect}
          loading="eager"
        />
      </SelectionCardGrid>

      {/* Trust badges */}
      <div className="flex flex-wrap justify-center gap-6 pt-2 text-sm font-medium">
        <span className="flex items-center gap-1.5" style={{ color: '#035349' }}>
          <span className="text-base">✓</span> Free quote
        </span>
        <span className="flex items-center gap-1.5" style={{ color: '#035349' }}>
          <span className="text-base">✓</span> No obligation
        </span>
        <span className="flex items-center gap-1.5" style={{ color: '#035349' }}>
          <span className="text-base">✓</span> Takes 2 minutes
        </span>
      </div>

    </div>
  );
}

export default Step1ServiceType;
