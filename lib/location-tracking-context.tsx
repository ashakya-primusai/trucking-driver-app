"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { clearSession, getToken } from "./auth-storage";
import { resolveSpeedKmh, type PositionSample } from "./derive-speed";
import { updateDriverLocation } from "./driver-api";
import {
  getEmulatedLocation,
  isEmulationEnabled,
} from "./location-emulation";
import {
  bearingRadFromSamples,
  getMotionSpeedKmh,
  requestMotionPermission,
  setMotionTravelBearing,
  startMotionSpeedTracker,
  stopMotionSpeedTracker,
  syncMotionSpeedFromGps,
} from "./motion-speed";

const LOCATION_PUSH_INTERVAL_MS = 5000;

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 20_000,
};

type LocationTrackingContextValue = {
  isTracking: boolean;
  lastSentAt: Date | null;
  /** Latest speed sent/stored (km/h), from GPS, accelerometer, or movement estimate */
  lastSpeedKmh: number | null;
  /** Latest GPS sample (lng/lat) the device produced — independent of server push. */
  lastPosition: { lat: number; lng: number } | null;
  lastError: string | null;
  isEmulationEnabled: boolean;
  startTracking: () => void;
  stopTracking: () => void;
};

const LocationTrackingContext = createContext<LocationTrackingContextValue | null>(null);

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission denied. Enable location in browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "Position unavailable. Try again outdoors or check GPS.";
    case err.TIMEOUT:
      return "Location request timed out.";
    default:
      return err.message || "Could not read location.";
  }
}

export function LocationTrackingProvider({ children }: { children: ReactNode }) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [lastSpeedKmh, setLastSpeedKmh] = useState<number | null>(null);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [emulationEnabled, setEmulationEnabled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTrackingRef = useRef(false);
  const lastSampleRef = useRef<PositionSample | null>(null);
  const clearLoop = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isTrackingRef.current = false;
    setIsTracking(false);
  }, []);

  const pushEmulated = useCallback(async (lng: number, lat: number): Promise<void> => {
    try {
      const res = await updateDriverLocation(lng, lat);
      const stored = res.data?.lastSpeedKmh;
      setLastSpeedKmh(stored != null && Number.isFinite(stored) ? stored : null);
      setLastPosition({ lat, lng });
      setLastSentAt(new Date());
      setLastError(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        clearLoop();
        clearSession();
        setLastError("Session expired. Sign in again.");
        throw e;
      }
      const msg = e instanceof Error ? e.message : "Failed to send location";
      setLastError(msg);
      throw e;
    }
  }, [clearLoop]);

  const pushOnce = useCallback((): Promise<void> => {
    if (isEmulationEnabled()) {
      const emulated = getEmulatedLocation();
      if (emulated) {
        return pushEmulated(emulated.lng, emulated.lat);
      }
    }

    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation is not supported on this device."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lng = pos.coords.longitude;
            const lat = pos.coords.latitude;

            const atMs = pos.timestamp > 0 ? pos.timestamp : Date.now();
            const current: PositionSample = { lng, lat, atMs };
            const prev = lastSampleRef.current;
            if (prev) {
              setMotionTravelBearing(bearingRadFromSamples(prev, current));
            }
            const speedKmh = resolveSpeedKmh(
              pos.coords.speed,
              prev,
              current,
              getMotionSpeedKmh()
            );
            if (speedKmh != null) {
              syncMotionSpeedFromGps(speedKmh);
            }
            lastSampleRef.current = current;
            setLastPosition({ lat, lng });

            const speedPayload =
              speedKmh != null && Number.isFinite(speedKmh)
                ? Math.round(speedKmh * 10) / 10
                : undefined;

            const res = await updateDriverLocation(lng, lat, speedKmh);
            const stored = res.data?.lastSpeedKmh;
            const resolved =
              stored != null && Number.isFinite(stored)
                ? stored
                : speedKmh != null && Number.isFinite(speedKmh)
                  ? speedKmh
                  : null;
            setLastSpeedKmh(resolved);
            setLastSentAt(new Date());
            setLastError(null);
            resolve();
          } catch (e) {
            if (e instanceof Error && e.message === "SESSION_EXPIRED") {
              clearLoop();
              clearSession();
              setLastError("Session expired. Sign in again.");
              reject(e);
              return;
            }
            const msg = e instanceof Error ? e.message : "Failed to send location";
            setLastError(msg);
            reject(e);
          }
        },
        (err) => {
          const msg = geoErrorMessage(err);
          setLastError(msg);
          reject(err);
        },
        GEO_OPTIONS
      );
    });
  }, [clearLoop, pushEmulated]);

  const stopTracking = useCallback(() => {
    clearLoop();
    stopMotionSpeedTracker();
    lastSampleRef.current = null;
    setLastSpeedKmh(null);
    setLastError(null);
  }, [clearLoop]);

  const startTracking = useCallback(async () => {
    if (!getToken()) {
      setLastError("Sign in required to share location.");
      return;
    }

    const usingEmulation = isEmulationEnabled() && getEmulatedLocation() != null;
    if (!usingEmulation && (typeof navigator === "undefined" || !navigator.geolocation)) {
      setLastError("Geolocation is not supported on this device.");
      return;
    }

    if (intervalRef.current != null) {
      return;
    }

    if (!usingEmulation) {
      const motionOk = await requestMotionPermission();
      if (motionOk) {
        startMotionSpeedTracker();
      }
    }

    setLastError(null);
    isTrackingRef.current = true;
    setIsTracking(true);

    void pushOnce().catch(() => {
      /* error already in lastError */
    });

    intervalRef.current = setInterval(() => {
      if (!isTrackingRef.current || !getToken()) {
        clearLoop();
        return;
      }
      void pushOnce().catch(() => {
        /* keep interval; user sees lastError */
      });
    }, LOCATION_PUSH_INTERVAL_MS);
  }, [clearLoop, pushOnce]);

  useEffect(() => {
    const syncEmulation = () => {
      const enabled = isEmulationEnabled();
      setEmulationEnabled(enabled);
      const emulated = getEmulatedLocation();
      if (enabled && emulated) {
        setLastPosition({ lat: emulated.lat, lng: emulated.lng });
        if (isTrackingRef.current) {
          void pushEmulated(emulated.lng, emulated.lat).catch(() => {});
        }
      }
    };
    syncEmulation();
    window.addEventListener("driver:emulated-location-changed", syncEmulation);
    return () => window.removeEventListener("driver:emulated-location-changed", syncEmulation);
  }, [pushEmulated]);

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isTrackingRef.current = false;
      stopMotionSpeedTracker();
    };
  }, []);

  const value = useMemo<LocationTrackingContextValue>(
    () => ({
      isTracking,
      lastSentAt,
      lastSpeedKmh,
      lastPosition,
      lastError,
      isEmulationEnabled: emulationEnabled,
      startTracking,
      stopTracking,
    }),
    [isTracking, lastSentAt, lastSpeedKmh, lastPosition, lastError, emulationEnabled, startTracking, stopTracking]
  );

  return (
    <LocationTrackingContext.Provider value={value}>{children}</LocationTrackingContext.Provider>
  );
}

export function useLocationTracking(): LocationTrackingContextValue {
  const ctx = useContext(LocationTrackingContext);
  if (!ctx) {
    throw new Error("useLocationTracking must be used within LocationTrackingProvider");
  }
  return ctx;
}
