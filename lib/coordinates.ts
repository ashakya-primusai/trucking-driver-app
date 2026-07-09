export type LatLng = { lat: number; lng: number };

/** Valid WGS-84 ranges; auto-corrects common lat/lng swap when |lat| > 90. */
export function normalizeLatLng(lat: number, lng: number): LatLng {
  let latN = lat;
  let lngN = lng;

  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    throw new Error("Invalid coordinates. Pick a valid point on the map.");
  }

  if (Math.abs(latN) > 90 && Math.abs(lngN) <= 90 && Math.abs(latN) <= 180) {
    [latN, lngN] = [lngN, latN];
  }

  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) {
    throw new Error("Coordinates out of range. Pick a valid point on the map.");
  }

  return { lat: latN, lng: lngN };
}

export function isValidLatLng(lat: number, lng: number): boolean {
  try {
    normalizeLatLng(lat, lng);
    return true;
  } catch {
    return false;
  }
}
