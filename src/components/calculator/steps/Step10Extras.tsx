/**
 * STEP 10: EXTRAS
 *
 * Optional add-on services with card-based selection:
 * - Packing (based on cubes)
 * - Cleaning (by property size)
 * - Storage (with promo)
 * - Assembly/Disassembly
 *
 * Prices shown in salesy manner, total hidden until submission
 */

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  calculatedCubes,
  setExtras,
  nextStep,
  prevStep,
  type ExtrasData,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG, type PackingSize } from '@/lib/calculator-config';
import { Card } from '@/components/ui/card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { cn } from '@/lib/utils';

// Types
type StorageKey = keyof typeof CALCULATOR_CONFIG.storage;

export function Step10Extras() {
  const state = useStore(calculatorStore);
  const cubes = useStore(calculatedCubes);

  // Local state for extras
  const [selectedPacking, setSelectedPacking] = useState<PackingSize | null>(state.extras?.packing || null);
  const [selectedCleaning, setSelectedCleaning] = useState<boolean>(!!state.extras?.cleaningRooms);
  const [selectedStorage, setSelectedStorage] = useState<boolean>(!!state.extras?.storage);
  const [selectedAssembly, setSelectedAssembly] = useState<boolean>((state.extras?.assembly?.length || 0) > 0);

  // Get property label and room count for cleaning estimate
  const propertySize = state.propertySize;
  const propertyLabel = CALCULATOR_CONFIG.propertySizeOptions.find(
    p => p.value === propertySize
  )?.label || 'your home';

  // Estimate rooms based on property size
  const estimatedRooms = getEstimatedRooms(propertySize);
  const cleaningPrice = estimatedRooms ? CALCULATOR_CONFIG.cleaning[estimatedRooms]?.price || 120 : 120;

  // Get recommended packing option based on cubes
  const getRecommendedPacking = (): PackingSize => {
    if (cubes <= 750) return 'small';
    if (cubes <= 1350) return 'medium';
    if (cubes <= 2000) return 'large';
    return 'xl';
  };

  const recommendedPacking = getRecommendedPacking();
  const fullPackingPrice = CALCULATOR_CONFIG.packing[recommendedPacking]?.total || 580;
  const fragileOnlyPrice = CALCULATOR_CONFIG.packing.fragileOnly.total;

  // Default storage option
  const defaultStorage: StorageKey = 'standardBedroom';

  // Format currency
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Handle continue
  const handleContinue = () => {
    // Build extras data based on selections
    const extras: Partial<ExtrasData> = {
      gateway: [],
      disassemblyItems: [],
      ...(selectedPacking && { packing: selectedPacking }),
      ...(selectedCleaning && estimatedRooms !== undefined && { cleaningRooms: estimatedRooms }),
      ...(selectedStorage && defaultStorage !== undefined && { storage: defaultStorage }),
      assembly: selectedAssembly ? [{ type: 'general', quantity: 1 }] : [],
    };

    setExtras(extras);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Would you like any extra services?
        </h2>
        <p className="text-muted-foreground mt-2">
          Select the services you're interested in - we'll include exact pricing in your quote
        </p>
      </div>

      {/* Extras Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Packing Service */}
        <ExtrasCard
          icon="📦"
          title="Professional Packing"
          isSelected={selectedPacking !== null}
          onToggle={() => setSelectedPacking(selectedPacking ? null : 'fragileOnly')}
        >
          <p className="text-sm text-muted-foreground mb-4">
            Let our trained team pack your belongings with care and premium materials.
          </p>

          {selectedPacking !== null && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPacking('fragileOnly');
                }}
                className={cn(
                  'w-full p-3 rounded-lg border text-left transition-all',
                  selectedPacking === 'fragileOnly'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">Just fragile items</span>
                  <span className="text-primary font-semibold">~{formatPrice(fragileOnlyPrice)}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPacking(recommendedPacking);
                }}
                className={cn(
                  'w-full p-3 rounded-lg border text-left transition-all',
                  selectedPacking !== 'fragileOnly'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">Full home packing</span>
                  <span className="text-primary font-semibold">~{formatPrice(fullPackingPrice)}</span>
                </div>
              </button>
            </div>
          )}

          {selectedPacking === null && (
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Fragile items only:</span> ~{formatPrice(fragileOnlyPrice)}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Full {propertyLabel}:</span> ~{formatPrice(fullPackingPrice)}
              </p>
            </div>
          )}
        </ExtrasCard>

        {/* Cleaning Service */}
        <ExtrasCard
          icon="✨"
          title="End of Tenancy Clean"
          isSelected={selectedCleaning}
          onToggle={() => setSelectedCleaning(!selectedCleaning)}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Professional deep clean to help you get your deposit back.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm">
              Estimated for {propertyLabel}:
            </span>
            <span className="text-primary font-semibold">~{formatPrice(cleaningPrice)}</span>
          </div>
        </ExtrasCard>

        {/* Storage Service */}
        <ExtrasCard
          icon="🏠"
          title="Secure Storage"
          isSelected={selectedStorage}
          onToggle={() => setSelectedStorage(!selectedStorage)}
          badge="First 2 months 50% off!"
          badgeVariant="success"
        >
          <p className="text-sm text-muted-foreground">
            Climate-controlled storage if your new place isn't ready yet.
          </p>
        </ExtrasCard>

        {/* Assembly Service */}
        <ExtrasCard
          icon="🔧"
          title="Furniture Dis/Assembly"
          isSelected={selectedAssembly}
          onToggle={() => setSelectedAssembly(!selectedAssembly)}
        >
          <p className="text-sm text-muted-foreground">
            Save time and hassle - we'll take apart and reassemble your furniture safely.
          </p>
        </ExtrasCard>
      </div>

      {/* Info note */}
      <p className="text-center text-sm text-muted-foreground">
        Exact prices will be calculated in your personalized quote
      </p>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        nextLabel="Continue"
      />
    </div>
  );
}

// ===================
// EXTRAS CARD COMPONENT
// ===================

interface ExtrasCardProps {
  icon: string;
  title: string;
  isSelected: boolean;
  onToggle: () => void;
  badge?: string;
  badgeVariant?: 'default' | 'success';
  children: React.ReactNode;
}

function ExtrasCard({
  icon,
  title,
  isSelected,
  onToggle,
  badge,
  badgeVariant = 'default',
  children
}: ExtrasCardProps) {
  return (
    <Card
      className={cn(
        'relative p-4 transition-all cursor-pointer',
        'hover:border-primary/50',
        isSelected && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}
      onClick={onToggle}
    >
      {/* Badge */}
      {badge && (
        <div className={cn(
          'absolute -top-2 right-4 px-2 py-0.5 rounded-full text-xs font-medium',
          badgeVariant === 'success' && 'bg-emerald-100 text-emerald-700',
          badgeVariant === 'default' && 'bg-primary/10 text-primary'
        )}>
          {badge}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>

        {/* Toggle indicator */}
        <div className={cn(
          'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
          isSelected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/30'
        )}>
          {isSelected && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Content */}
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </Card>
  );
}

// ===================
// HELPER FUNCTIONS
// ===================

function getEstimatedRooms(propertySize: string | null): number {
  const roomMap: Record<string, number> = {
    'studio': 1,
    '1bed': 2,
    '2bed': 3,
    '3bed-small': 4,
    '3bed-large': 4,
    '4bed': 5,
    '5bed': 6,
    '5bed-plus': 6,
  };
  return propertySize ? (roomMap[propertySize] || 3) : 3;
}

export default Step10Extras;
