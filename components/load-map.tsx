// Imported only from client components, so no "use client" boundary here.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { AssignedLoad, fetchLoadRoute } from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { activeStop, placeShort, sortedStops } from "@/lib/load-stops";
import type { StopMarker } from "@/components/load-stops-map";

const LoadStopsMap = dynamic(() => import("@/components/load-stops-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[color:var(--canvas-muted)]" />,
});

function markerType(type: string | undefined): StopMarker["type"] {
  return type === "pickup" || type === "delivery" || type === "warehouse" ? type : "stop";
}

function markerStatus(status: string | undefined): StopMarker["status"] {
  switch (status) {
    case "en_route":
    case "arrived":
    case "completed":
    case "skipped":
    case "failed":
      return status;
    default:
      return "pending";
  }
}

/**
 * Map of one load: its stops, the planned truck route and the driver's position.
 * `isolate` keeps Leaflet's high z-index controls from drawing over cards that overlap the map.
 */
export function LoadMap({
  load,
  className,
  children,
}: {
  load: AssignedLoad | null;
  className?: string;
  /** Overlay (back button, chips) drawn on top of the map. */
  children?: React.ReactNode;
}) {
  const { lastPosition } = useLocationTracking();
  const [route, setRoute] = useState<{ loadId: string; path: [number, number][] } | null>(null);
  const loadId = load?._id;

  useEffect(() => {
    if (!loadId) return;
    let cancelled = false;
    fetchLoadRoute(loadId)
      .then((data) => {
        if (cancelled || data?.status !== "ready" || !data.routes?.length) return;
        const primary =
          data.assignedRouteIndex != null && data.routes[data.assignedRouteIndex]
            ? data.routes[data.assignedRouteIndex]
            : data.routes.find((r) => r.primary) ?? data.routes[0];
        if (primary?.geometry?.coordinates?.length) setRoute({ loadId, path: primary.geometry.coordinates });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadId]);

  const routePath = route && route.loadId === loadId ? route.path : undefined;
  const currentNum = activeStop(load)?.num;

  const markers: StopMarker[] = useMemo(
    () =>
      sortedStops(load).flatMap(({ stop, num }) => {
        const [lng, lat] = stop.coordinates ?? [NaN, NaN];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        return [
          {
            id: String(num),
            position: { lat, lng },
            number: num,
            type: markerType(stop.type),
            status: markerStatus(stop.stopStatus),
            isCurrent: currentNum === num,
            label: placeShort(stop),
          },
        ];
      }),
    [load, currentNum]
  );

  const fitKey =
    `${loadId ?? ""}:` + markers.map((m) => m.id).join("|") + (lastPosition ? "+d" : "") + (routePath ? "+r" : "");

  return (
    <div className={`relative isolate w-full shrink-0 ${className ?? ""}`}>
      <LoadStopsMap driver={lastPosition} stops={markers} routePath={routePath} fitKey={fitKey} />
      {children ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {children}
        </div>
      ) : null}
    </div>
  );
}
