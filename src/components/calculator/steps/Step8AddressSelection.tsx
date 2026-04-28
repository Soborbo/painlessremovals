/**
 * STEP 8: ADDRESS SELECTION (COMBINED)
 *
 * Combined from/to address selection with:
 * - Map at the top showing route
 * - From and To address fields below
 * - Real-time route display
 * - Distance and drive time shown under map
 *
 * Uses new Google Maps APIs:
 *   - PlaceAutocompleteElement (replaces Autocomplete widget)
 *   - Route.computeRoutes (replaces DirectionsService)
 *   - route.createPolylines (replaces DirectionsRenderer)
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  quoteResult,
  setFromAddress,
  setToAddress,
  setDistances,
  nextStep,
  prevStep,
  type AddressData,
  type DistanceData,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { Card } from '@/components/ui/card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { trackError } from '@/lib/errors/tracker';

// Floor level options
const FLOOR_LEVELS = [
  { value: '-1', label: 'Basement (-1)' },
  { value: '0', label: 'Ground floor (0)' },
  { value: '1', label: '1st floor' },
  { value: '2', label: '2nd floor' },
  { value: '3', label: '3rd floor' },
  { value: '4', label: '4th floor' },
  { value: '5', label: '5th floor' },
  { value: '6', label: '6th floor' },
  { value: '7', label: '7th floor' },
  { value: '8', label: '8th floor' },
  { value: '9', label: '9th floor' },
  { value: '10', label: '10th floor' },
];

// Google Maps is loaded globally via script tag
declare const google: any;

// Depot location (Bristol BS10 5PN)
const DEPOT_LOCATION = {
  lat: 51.5074,
  lng: -2.6051,
  address: CALCULATOR_CONFIG.company.depot,
};

export function Step8AddressSelection() {
  const state = useStore(calculatorStore);

  // Clearance uses a simplified single-address view
  if (state.serviceType === 'clearance') {
    return <ClearanceAddressSelection />;
  }

  return <MoveAddressSelection />;
}

function MoveAddressSelection() {
  const state = useStore(calculatorStore);
  const quote = useStore(quoteResult);
  const [fromAddress, setFromAddressLocal] = useState<AddressData | null>(state.fromAddress);
  const [toAddress, setToAddressLocal] = useState<AddressData | null>(state.toAddress);
  const [fromFloorLevel, setFromFloorLevel] = useState<string>(
    state.fromAddress?.floorLevel?.toString() ?? '0'
  );
  const [toFloorLevel, setToFloorLevel] = useState<string>(
    state.toAddress?.floorLevel?.toString() ?? '0'
  );
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<DistanceData | null>(state.distances);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const fromAddressRef = useRef(fromAddress);
  const toAddressRef = useRef(toAddress);

  const fromContainerRef = useRef<HTMLDivElement>(null);
  const toContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const fromAutoElRef = useRef<any>(null);
  const toAutoElRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);

  // Keep refs in sync with state
  useEffect(() => { fromAddressRef.current = fromAddress; }, [fromAddress]);
  useEffect(() => { toAddressRef.current = toAddress; }, [toAddress]);

  // Check if Google Maps is loaded
  useEffect(() => {
    const checkGoogle = () => {
      if (typeof google !== 'undefined' && google.maps?.places) {
        setGoogleLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGoogle()) return;

    const interval = setInterval(() => {
      if (checkGoogle()) {
        clearInterval(interval);
      }
    }, 100);

    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !googleLoaded) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        zoom: 8,
        center: { lat: 51.4545, lng: -2.5879 }, // Bristol
        disableDefaultUI: true,
        zoomControl: true,
        mapId: 'DEMO_MAP_ID',
      });
    }
  }, [googleLoaded]);

  // Initialize From autocomplete (PlaceAutocompleteElement)
  useEffect(() => {
    if (!fromContainerRef.current || !googleLoaded || fromAutoElRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['gb'],
      includedPrimaryTypes: ['geocode'],
    });
    el.placeholder = 'Enter current address';
    // Pre-populate if returning to this step
    if (state.fromAddress?.formatted) el.value = state.fromAddress.formatted;
    fromContainerRef.current.appendChild(el);
    fromAutoElRef.current = el;

    el.addEventListener('gmp-select', async (e: any) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });

      const postcodeComponent = place.addressComponents?.find(
        (c: any) => c.types.includes('postal_code')
      );

      const addressData: AddressData = {
        formatted: place.formattedAddress || '',
        postcode: postcodeComponent?.longText || '',
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      };

      setFromAddressLocal(addressData);

      if (toAddressRef.current) {
        calculateRoute(addressData, toAddressRef.current);
      }
    });

    return () => {
      el.remove();
      fromAutoElRef.current = null;
    };
  }, [googleLoaded]);

  // Initialize To autocomplete (PlaceAutocompleteElement)
  useEffect(() => {
    if (!toContainerRef.current || !googleLoaded || toAutoElRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['gb'],
      includedPrimaryTypes: ['geocode'],
    });
    el.placeholder = 'Enter new address';
    if (state.toAddress?.formatted) el.value = state.toAddress.formatted;
    toContainerRef.current.appendChild(el);
    toAutoElRef.current = el;

    el.addEventListener('gmp-select', async (e: any) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });

      const postcodeComponent = place.addressComponents?.find(
        (c: any) => c.types.includes('postal_code')
      );

      const addressData: AddressData = {
        formatted: place.formattedAddress || '',
        postcode: postcodeComponent?.longText || '',
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      };

      setToAddressLocal(addressData);

      if (fromAddressRef.current) {
        calculateRoute(fromAddressRef.current, addressData);
      }
    });

    return () => {
      el.remove();
      toAutoElRef.current = null;
    };
  }, [googleLoaded]);

  // Calculate route using Routes API + DistanceMatrix
  const calculateRoute = async (from: AddressData, to: AddressData) => {
    if (!googleLoaded) return;

    setIsCalculatingRoute(true);

    try {
      const distanceService = new google.maps.DistanceMatrixService();

      const origin = from.lat && from.lng
        ? { lat: from.lat, lng: from.lng }
        : from.formatted;

      const destination = to.lat && to.lng
        ? { lat: to.lat, lng: to.lng }
        : to.formatted;

      // Display route on map using Routes API
      if (mapInstanceRef.current) {
        // Clean up old polylines
        polylinesRef.current.forEach(p => p.setMap(null));
        polylinesRef.current = [];

        try {
          const { Route } = await google.maps.importLibrary('routes');
          const { routes } = await Route.computeRoutes({
            origin,
            destination,
            travelMode: 'DRIVE',
            fields: ['path'],
          });

          if (routes?.[0]) {
            const polylines = routes[0].createPolylines();
            polylines.forEach((p: any) => {
              p.setOptions({ strokeColor: '#3b82f6', strokeWeight: 4 });
              p.setMap(mapInstanceRef.current);
            });
            polylinesRef.current = polylines;

            const bounds = new google.maps.LatLngBounds();
            polylines.forEach((p: any) => {
              const path = p.getPath();
              for (let i = 0; i < path.getLength(); i++) {
                bounds.extend(path.getAt(i));
              }
            });
            mapInstanceRef.current.fitBounds(bounds);
          }
        } catch (routeErr) {
          trackError('MOVE-ADDR-003', routeErr, { phase: 'route-display' }, 'Step8AddressSelection');
        }
      }

      // Calculate all three legs using DistanceMatrix
      const distanceResult = await distanceService.getDistanceMatrix({
        origins: [DEPOT_LOCATION, from.formatted, to.formatted],
        destinations: [from.formatted, to.formatted, DEPOT_LOCATION],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      });

      if (distanceResult.rows) {
        const depotToFrom = distanceResult.rows[0]?.elements[0];
        const fromToTo = distanceResult.rows[1]?.elements[1];
        const toToDepot = distanceResult.rows[2]?.elements[2];

        const depotToFromMiles = metersToMiles(depotToFrom?.distance?.value || 0);
        const fromToToMiles = metersToMiles(fromToTo?.distance?.value || 0);
        const toToDepotMiles = metersToMiles(toToDepot?.distance?.value || 0);

        const depotToFromMinutes = (depotToFrom?.duration?.value || 0) / 60;
        const fromToToMinutes = (fromToTo?.duration?.value || 0) / 60;
        const toToDepotMinutes = (toToDepot?.duration?.value || 0) / 60;

        const totalDriveTimeHours = (depotToFromMinutes + fromToToMinutes + toToDepotMinutes) / 60;

        const distances: DistanceData = {
          depotToFrom: depotToFromMiles,
          fromToTo: fromToToMiles,
          toToDepot: toToDepotMiles,
          driveTimeHours: totalDriveTimeHours,
          customerDistance: fromToToMiles,
          customerDriveMinutes: fromToToMinutes,
        };

        setDistanceInfo(distances);
      }
    } catch (err) {
      trackError('MOVE-ADDR-003', err, { phase: 'route-calculation' }, 'Step8AddressSelection');
      toast.error('Could not calculate route. Please check both addresses.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Handle continue
  const handleContinue = () => {
    if (!fromAddress || !toAddress) {
      toast.warning('Please enter both addresses');
      return;
    }

    // Include floor levels in address data (default to 0 if NaN)
    setFromAddress({
      ...fromAddress,
      floorLevel: parseInt(fromFloorLevel, 10) || 0,
    });
    setToAddress({
      ...toAddress,
      floorLevel: parseInt(toFloorLevel, 10) || 0,
    });
    if (distanceInfo) {
      setDistances(distanceInfo);
    }
    nextStep();
  };

  // Can continue? Require both addresses AND calculated distances
  const canContinue = fromAddress && toAddress && distanceInfo && !isCalculatingRoute;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Where are you moving from and to?
        </h2>
      </div>

      {/* Map */}
      <Card className="overflow-hidden">
        <div className="relative w-full h-[250px] bg-muted">
          <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ minHeight: '250px' }} />
          {!googleLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Spinner className="h-8 w-8" />
              <span className="ml-2 text-muted-foreground">Loading map...</span>
            </div>
          )}
          {isCalculatingRoute && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
              <Spinner className="h-8 w-8" />
              <span className="ml-2 text-muted-foreground">Calculating route...</span>
            </div>
          )}
        </div>

        {/* Distance info - shown under map */}
        {distanceInfo && (
          <div className="p-4 bg-muted/30 border-t">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {Math.round(distanceInfo.customerDistance)} mi
                </div>
                <div className="text-sm text-muted-foreground">Distance</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {formatDuration(distanceInfo.customerDriveMinutes)}
                </div>
                <div className="text-sm text-muted-foreground">Drive time</div>
              </div>
            </div>

            {/* 2-day / accommodation notice — driven by billing decision,
                only shown when destination is far enough from depot that
                the crew can't drive home. */}
            {(() => {
              const farFromDepot =
                distanceInfo.toToDepot > CALCULATOR_CONFIG.accommodation.minDistanceMiles;
              const billingType = quote?.billingType;
              if (!farFromDepot) return null;
              if (billingType === 'splitDay') {
                return (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm text-center">
                    <strong>2-day move</strong> - This move will run across 2 days. Overnight accommodation for our crew is included in your quote.
                  </div>
                );
              }
              if (billingType === 'warningZone') {
                return (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm text-center">
                    <strong>May run into a second day</strong> - At this distance and size, the job may not fit into a single day. If it doesn't, overnight accommodation for our crew will be included — we'll confirm on the call.
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}
      </Card>

      {/* Address Fields */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* From Address */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-sm font-medium">
              A
            </div>
            <Label className="font-medium">Moving from</Label>
          </div>
          <div ref={fromContainerRef} />
          {fromAddress && (
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
              <span>✓</span>
              <span className="truncate">{fromAddress.postcode || 'Address selected'}</span>
            </div>
          )}
          {/* Floor level dropdown */}
          <div className="mt-3">
            <Label htmlFor="from-floor" className="text-sm text-muted-foreground">
              Which floor?
            </Label>
            <Select
              id="from-floor"
              value={fromFloorLevel}
              onChange={(e) => setFromFloorLevel(e.target.value)}
              className="mt-1"
            >
              {FLOOR_LEVELS.map((floor) => (
                <option key={floor.value} value={floor.value}>
                  {floor.label}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        {/* To Address */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-medium">
              B
            </div>
            <Label className="font-medium">Moving to</Label>
          </div>
          <div ref={toContainerRef} />
          {toAddress && (
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
              <span>✓</span>
              <span className="truncate">{toAddress.postcode || 'Address selected'}</span>
            </div>
          )}
          {/* Floor level dropdown */}
          <div className="mt-3">
            <Label htmlFor="to-floor" className="text-sm text-muted-foreground">
              Which floor?
            </Label>
            <Select
              id="to-floor"
              value={toFloorLevel}
              onChange={(e) => setToFloorLevel(e.target.value)}
              className="mt-1"
            >
              {FLOOR_LEVELS.map((floor) => (
                <option key={floor.value} value={floor.value}>
                  {floor.label}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      </div>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        canGoNext={!!canContinue}
        nextLabel="Continue"
      />
    </div>
  );
}

// Helper functions
function metersToMiles(meters: number): number {
  return meters / 1609.34;
}

function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(minutes: number): string {
  const mins = Math.round(minutes);
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMins}m`;
}

// ===================
// CLEARANCE ADDRESS (SINGLE LOCATION)
// ===================

function ClearanceAddressSelection() {
  const state = useStore(calculatorStore);

  const [address, setAddressLocal] = useState<AddressData | null>(state.fromAddress);
  const [inputValue, setInputValue] = useState(state.fromAddress?.formatted || '');
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<DistanceData | null>(state.distances);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const addressRef = useRef(address);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoElRef = useRef<any>(null);

  useEffect(() => { addressRef.current = address; }, [address]);

  // Check if Google Maps is loaded
  useEffect(() => {
    const checkGoogle = () => {
      if (typeof google !== 'undefined' && google.maps?.places) {
        setGoogleLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGoogle()) return;

    const interval = setInterval(() => {
      if (checkGoogle()) clearInterval(interval);
    }, 100);

    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize autocomplete (PlaceAutocompleteElement)
  useEffect(() => {
    if (!containerRef.current || !googleLoaded || autoElRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['gb'],
      includedPrimaryTypes: ['geocode'],
    });
    el.placeholder = 'Enter the property address';
    if (state.fromAddress?.formatted) el.value = state.fromAddress.formatted;
    containerRef.current.appendChild(el);
    autoElRef.current = el;

    el.addEventListener('gmp-select', async (e: any) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });

      const postcodeComponent = place.addressComponents?.find(
        (c: any) => c.types.includes('postal_code')
      );

      const addressData: AddressData = {
        formatted: place.formattedAddress || '',
        postcode: postcodeComponent?.longText || '',
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      };

      setAddressLocal(addressData);
      setInputValue(place.formattedAddress || '');
      calculateClearanceDistance(addressData);
    });

    return () => {
      el.remove();
      autoElRef.current = null;
    };
  }, [googleLoaded]);

  // Calculate depot -> location -> depot distance
  const calculateClearanceDistance = async (location: AddressData) => {
    if (!googleLoaded) return;

    setIsCalculatingRoute(true);

    try {
      const distanceService = new google.maps.DistanceMatrixService();

      // Two legs: depot -> location, location -> depot
      const result = await distanceService.getDistanceMatrix({
        origins: [DEPOT_LOCATION, location.formatted],
        destinations: [location.formatted, DEPOT_LOCATION],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      });

      if (result.rows) {
        const depotToLocation = result.rows[0]?.elements[0];
        const locationToDepot = result.rows[1]?.elements[1];

        const depotToLocationMiles = metersToMiles(depotToLocation?.distance?.value || 0);
        const locationToDepotMiles = metersToMiles(locationToDepot?.distance?.value || 0);

        const depotToLocationMinutes = (depotToLocation?.duration?.value || 0) / 60;
        const locationToDepotMinutes = (locationToDepot?.duration?.value || 0) / 60;

        const totalDriveTimeHours = (depotToLocationMinutes + locationToDepotMinutes) / 60;

        const distances: DistanceData = {
          depotToFrom: depotToLocationMiles,
          fromToTo: 0, // No from->to for clearance, same location
          toToDepot: locationToDepotMiles,
          driveTimeHours: totalDriveTimeHours,
          customerDistance: depotToLocationMiles,
          customerDriveMinutes: depotToLocationMinutes,
        };

        setDistanceInfo(distances);
      }
    } catch (err) {
      trackError('MOVE-ADDR-003', err, { phase: 'distance-calculation' }, 'Step8AddressSelection');
      toast.error('Could not calculate distance. Please check the address.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Handle continue
  const handleContinue = () => {
    const resolvedAddress: AddressData = address || {
      formatted: inputValue.trim(),
      postcode: '',
    };

    if (!resolvedAddress.formatted) {
      toast.warning('Please enter the clearance address');
      return;
    }

    setFromAddress(resolvedAddress);
    // For clearance, toAddress is same as fromAddress (single location)
    setToAddress(resolvedAddress);
    if (distanceInfo) {
      setDistances(distanceInfo);
    } else if (resolvedAddress.lat && resolvedAddress.lng) {
      // Fallback: estimate distance using straight-line from depot
      const straightLine = haversineDistanceMiles(
        DEPOT_LOCATION.lat, DEPOT_LOCATION.lng,
        resolvedAddress.lat, resolvedAddress.lng
      );
      const roadDistance = straightLine * 1.3; // ~30% road factor
      const estimatedMinutes = (roadDistance / 30) * 60; // 30 mph average
      setDistances({
        depotToFrom: roadDistance,
        fromToTo: 0,
        toToDepot: roadDistance,
        driveTimeHours: (estimatedMinutes * 2) / 60,
        customerDistance: roadDistance,
        customerDriveMinutes: estimatedMinutes,
      });
    }
    nextStep();
  };

  const canContinue = (address || inputValue.trim().length > 0) && !isCalculatingRoute;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Where is the clearance?
        </h2>
        <p className="text-muted-foreground mt-2">
          Enter the property address for your clearance
        </p>
      </div>

      {/* Address Field */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-sm font-medium">
            📍
          </div>
          <Label className="font-medium">Clearance address</Label>
        </div>
        <div ref={containerRef} />
        {address && (
          <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
            <span>✓</span>
            <span className="truncate">{address.postcode || 'Address selected'}</span>
          </div>
        )}
      </Card>

      {/* Distance info */}
      {distanceInfo && (
        <Card className="p-4 bg-muted/30">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-foreground">
                {Math.round(distanceInfo.customerDistance)} mi
              </div>
              <div className="text-sm text-muted-foreground">From our depot</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">
                {formatDuration(distanceInfo.customerDriveMinutes)}
              </div>
              <div className="text-sm text-muted-foreground">Drive time</div>
            </div>
          </div>
        </Card>
      )}

      {isCalculatingRoute && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Spinner className="h-5 w-5" />
          <span className="text-muted-foreground text-sm">Calculating distance...</span>
        </div>
      )}

      {/* Navigation */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        canGoNext={!!canContinue}
        nextLabel="Continue"
      />
    </div>
  );
}

export default Step8AddressSelection;
