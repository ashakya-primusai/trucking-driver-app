import type { AssignedLoad, LoadStop, UpdateLoadStopAction } from "./driver-api";

export type DecoratedStop = { stop: LoadStop; rawIndex: number; num: number };

const DONE_STATUSES = new Set(["completed", "skipped", "failed"]);

/** Stop number the API expects (falls back to 1-based position). */
export function stopNumberForApi(stop: LoadStop, rawIndex: number): number {
  const n = stop.stopNumber;
  return typeof n === "number" && n > 0 ? n : rawIndex + 1;
}

export function sortedStops(load: AssignedLoad | null | undefined): DecoratedStop[] {
  return (load?.stops ?? [])
    .map((stop, rawIndex) => ({ stop, rawIndex, num: stopNumberForApi(stop, rawIndex) }))
    .sort((a, b) => a.num - b.num);
}

export function isStopDone(stop: LoadStop): boolean {
  return DONE_STATUSES.has(stop.stopStatus ?? "pending");
}

/** The one stop the driver should act on now: en route / arrived first, else the first pending stop. */
export function activeStop(load: AssignedLoad | null | undefined): DecoratedStop | null {
  const stops = sortedStops(load);
  return (
    stops.find(({ stop }) => stop.stopStatus === "en_route" || stop.stopStatus === "arrived") ??
    stops.find(({ stop }) => !isStopDone(stop)) ??
    null
  );
}

/** Next action for a stop, or null when nothing is left to do. */
export function nextActionFor(stop: LoadStop): UpdateLoadStopAction | null {
  switch (stop.stopStatus ?? "pending") {
    case "pending":
      return "en_route";
    case "en_route":
      return "arrived";
    case "arrived":
      return "completed";
    default:
      return null;
  }
}

export function stopTypeLabel(type: string | undefined): string {
  if (type === "pickup") return "Pickup";
  if (type === "delivery") return "Delivery";
  if (type === "warehouse") return "Yard";
  return type ? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Stop";
}

export function actionLabel(action: UpdateLoadStopAction, stop: LoadStop): string {
  switch (action) {
    case "en_route":
      return "Start driving";
    case "arrived":
      return "I'm here";
    case "completed":
      return stop.type === "delivery" ? "Delivered" : stop.type === "pickup" ? "Loaded" : "Done";
    default:
      return "Update";
  }
}

export function stopStatusLabel(status: string | undefined): string {
  switch (status) {
    case "en_route":
      return "Driving";
    case "arrived":
      return "At stop";
    case "completed":
      return "Done";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    default:
      return "Not started";
  }
}

export function placeShort(s: LoadStop | undefined): string {
  if (!s) return "—";
  return [s.city, s.state].filter(Boolean).join(", ") || s.address || stopTypeLabel(s.type);
}

export function addressLines(s: LoadStop): string[] {
  const lines: string[] = [];
  if (s.address?.trim()) lines.push(s.address.trim());
  const cityLine = [s.city, s.state, s.zip].filter(Boolean).join(", ").trim();
  if (cityLine) lines.push(cityLine);
  return lines;
}

export function loadCode(load: AssignedLoad): string {
  return load.loadNumber?.trim() || load.referenceNumber?.trim() || load._id.slice(-8);
}

export function loadRouteLabel(load: AssignedLoad): string {
  const stops = sortedStops(load);
  if (stops.length === 0) {
    return [load.pickupLocation, load.destination].filter(Boolean).join(" → ") || "Stops not listed";
  }
  const start = placeShort(stops[0].stop);
  const end = placeShort(stops[stops.length - 1].stop);
  return start === end ? start : `${start} → ${end}`;
}

/** Google Maps directions link — opens the Maps app on phones. */
export function mapsDirectionsUrl(s: LoadStop): string | null {
  if (s.coordinates && s.coordinates.length === 2) {
    const [lng, lat] = s.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    }
  }
  const dest = [s.address, s.city, s.state, s.zip].filter(Boolean).join(", ").trim();
  if (!dest) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export function formatMiles(meters: number): string {
  const mi = meters / 1609.34;
  return mi >= 10 ? `${Math.round(mi).toLocaleString()} mi` : `${mi.toFixed(1)} mi`;
}
