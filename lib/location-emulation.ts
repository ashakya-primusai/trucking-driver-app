import { normalizeLatLng } from "./coordinates";

const EMULATED_LOCATION_KEY = "driver_app_emulated_location";
const EMULATED_ENABLED_KEY = "driver_app_emulation_enabled";

export type EmulatedLocation = {
  lat: number;
  lng: number;
};

export function getEmulatedLocation(): EmulatedLocation | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(EMULATED_LOCATION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EmulatedLocation;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    try {
      const normalized = normalizeLatLng(parsed.lat, parsed.lng);
      if (normalized.lat !== parsed.lat || normalized.lng !== parsed.lng) {
        localStorage.setItem(EMULATED_LOCATION_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      localStorage.removeItem(EMULATED_LOCATION_KEY);
      return null;
    }
  } catch {
    localStorage.removeItem(EMULATED_LOCATION_KEY);
    return null;
  }
}

export function setEmulatedLocation(lat: number, lng: number) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLatLng(lat, lng);
  localStorage.setItem(EMULATED_LOCATION_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("driver:emulated-location-changed"));
}

export function isEmulationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(EMULATED_ENABLED_KEY) === "1";
}

export function setEmulationEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMULATED_ENABLED_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("driver:emulated-location-changed"));
}

export function clearEmulatedLocation() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(EMULATED_LOCATION_KEY);
  localStorage.removeItem(EMULATED_ENABLED_KEY);
  window.dispatchEvent(new CustomEvent("driver:emulated-location-changed"));
}
