/** Haversine distance in km between two WGS84 points. */
function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type PositionSample = {
  lng: number;
  lat: number;
  atMs: number;
};

const MIN_DT_SEC = 1;
const MAX_SPEED_KMH = 150;
/** Ignore sub-15 m movement as GPS noise when estimating speed. */
const MIN_MOVE_KM = 0.015;

/**
 * Estimate speed (km/h) between two fixes. Returns 0 when essentially stationary.
 */
export function deriveSpeedKmh(from: PositionSample, to: PositionSample): number | null {
  const dtSec = (to.atMs - from.atMs) / 1000;
  if (!Number.isFinite(dtSec) || dtSec < MIN_DT_SEC) return null;

  const km = haversineKm(from.lng, from.lat, to.lng, to.lat);
  if (km < MIN_MOVE_KM) return 0;

  const speedKmh = (km / dtSec) * 3600;
  if (!Number.isFinite(speedKmh) || speedKmh > MAX_SPEED_KMH) return null;

  return Math.round(speedKmh * 10) / 10;
}

/**
 * Resolve speed (km/h): GPS → accelerometer integration → movement between fixes.
 */
export function resolveSpeedKmh(
  coordsSpeedMs: number | null,
  previous: PositionSample | null,
  current: PositionSample,
  motionSpeedKmh?: number | null
): number | undefined {
  if (coordsSpeedMs != null && Number.isFinite(coordsSpeedMs) && coordsSpeedMs >= 0) {
    return Math.round(coordsSpeedMs * 3.6 * 10) / 10;
  }

  if (motionSpeedKmh != null && Number.isFinite(motionSpeedKmh) && motionSpeedKmh >= 0) {
    return Math.round(motionSpeedKmh * 10) / 10;
  }

  if (!previous) return undefined;
  const derived = deriveSpeedKmh(previous, current);
  return derived ?? undefined;
}

/** Human-readable speed for the driver UI (km/h). */
export function formatDriverSpeedKmh(speedKmh: number | null | undefined): string | null {
  if (speedKmh == null || !Number.isFinite(speedKmh)) return null;
  if (speedKmh < 1) return "Stopped";
  if (speedKmh >= 100) return `${Math.round(speedKmh)} km/h`;
  return `${speedKmh.toFixed(1)} km/h`;
}
