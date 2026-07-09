"use client";

import { useEffect, useRef } from "react";
import type {
  LatLng as LeafletLatLng,
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";

export type LatLng = { lat: number; lng: number };

export type StopMarker = {
  id: string;
  position: LatLng;
  number: number;
  type: "pickup" | "delivery" | "warehouse" | "stop";
  status: "pending" | "en_route" | "arrived" | "completed" | "skipped" | "failed";
  isCurrent?: boolean;
  label?: string;
};

export type RouteLayer = {
  /** [lng, lat][] coordinates from routing engine */
  path: [number, number][];
  color: string;
  /** Optional label shown at the midpoint */
  label?: string;
};

type Props = {
  driver: LatLng | null;
  stops: StopMarker[];
  /** Single route path (single-load detail view). Falls back to straight lines if absent. */
  routePath?: [number, number][];
  /** Multiple named+colored routes (home overview map). Overrides routePath when present. */
  routes?: RouteLayer[];
  className?: string;
  /** Identifier — when this changes the map re-fits its bounds. */
  fitKey?: string;
};

const FALLBACK_CENTER: [number, number] = [39.5, -98.35];

export default function LoadStopsMap({ driver, stops, routePath, routes, className, fitKey }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const driverMarkerRef = useRef<LeafletMarker | null>(null);
  const stopMarkersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const polylineRef = useRef<LeafletPolyline | null>(null);
  const routeLayersRef = useRef<LeafletPolyline[]>([]);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const fitAppliedKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const initial = pickInitialCenter(driver, stops);

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        touchZoom: true,
        dragging: true,
      }).setView(initial, driver || stops.length > 0 ? 11 : 4);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }
      ).addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);

      mapRef.current = map;
      sync();
    })();

    const stopMarkers = stopMarkersRef.current;
    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
      driverMarkerRef.current = null;
      stopMarkers.clear();
      polylineRef.current = null;
      routeLayersRef.current = [];
      fitAppliedKey.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (driver) {
      const icon = L.divIcon({
        className: "driver-marker-wrap",
        html:
          '<div class="driver-marker"><span class="driver-pulse"></span><span class="driver-dot"></span></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driver.lat, driver.lng]).setIcon(icon);
      } else {
        driverMarkerRef.current = L.marker([driver.lat, driver.lng], {
          icon,
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }

    const seen = new Set<string>();
    for (const stop of stops) {
      seen.add(stop.id);
      const variant =
        stop.type === "pickup"
          ? "pickup"
          : stop.type === "delivery"
            ? "delivery"
            : "stop";
      const classes = [
        "stop-marker",
        variant,
        stop.isCurrent ? "current" : "",
        stop.status === "completed" ? "completed" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const icon = L.divIcon({
        className: "stop-marker-wrap",
        html: `<div class="${classes}">${stop.number}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const existing = stopMarkersRef.current.get(stop.id);
      if (existing) {
        existing.setLatLng([stop.position.lat, stop.position.lng]).setIcon(icon);
        if (stop.label) existing.bindTooltip(stop.label, { direction: "top", offset: [0, -14] });
      } else {
        const m = L.marker([stop.position.lat, stop.position.lng], { icon }).addTo(map);
        if (stop.label) m.bindTooltip(stop.label, { direction: "top", offset: [0, -14] });
        stopMarkersRef.current.set(stop.id, m);
      }
    }
    for (const [id, marker] of stopMarkersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        stopMarkersRef.current.delete(id);
      }
    }

    if (routes && routes.length > 0) {
      // ── Multi-route mode (home overview) ──────────────────────
      // Remove old single polyline if any
      if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }

      // Rebuild named route layers
      routeLayersRef.current.forEach((p) => p.remove());
      routeLayersRef.current = [];

      for (const layer of routes) {
        if (layer.path.length < 2) continue;
        // layer.path is [lng, lat][] — Leaflet needs [lat, lng]
        const latlngs = layer.path.map(([lng, lat]) => [lat, lng] as [number, number]);
        const pl = L.polyline(latlngs, {
          color: layer.color,
          weight: 5,
          opacity: 0.9,
          lineCap: "round",
        }).addTo(map);
        routeLayersRef.current.push(pl);
      }

      // Fit to all routes + driver
      const allLatLngs: LeafletLatLng[] = [];
      if (driver) allLatLngs.push(L.latLng(driver.lat, driver.lng));
      for (const layer of routes) {
        layer.path.forEach(([lng, lat]) => allLatLngs.push(L.latLng(lat, lng)));
      }
      stops.forEach((s) => allLatLngs.push(L.latLng(s.position.lat, s.position.lng)));

      const currentFitKey = fitKey ?? routes.map((r) => r.label ?? r.color).join("|");
      if (currentFitKey && fitAppliedKey.current !== currentFitKey && allLatLngs.length > 0) {
        fitAppliedKey.current = currentFitKey;
        if (allLatLngs.length === 1) {
          map.setView(allLatLngs[0], 13, { animate: true });
        } else {
          map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40], maxZoom: 13, animate: true });
        }
      }
    } else {
      // ── Single-route mode (load detail) ───────────────────────
      routeLayersRef.current.forEach((p) => p.remove());
      routeLayersRef.current = [];

      let path: [number, number][];
      if (routePath && routePath.length >= 2) {
        path = routePath.map(([lng, lat]) => [lat, lng] as [number, number]);
      } else {
        path = [];
        if (driver) path.push([driver.lat, driver.lng]);
        for (const stop of stops) path.push([stop.position.lat, stop.position.lng]);
      }

      if (path.length >= 2) {
        const style = routePath && routePath.length >= 2
          ? { color: "#f97316", weight: 5, opacity: 0.9, lineCap: "round" as const }
          : { color: "#f97316", weight: 4, opacity: 0.85, dashArray: "8 10", lineCap: "round" as const };
        if (polylineRef.current) {
          polylineRef.current.setLatLngs(path);
          polylineRef.current.setStyle(style);
        } else {
          polylineRef.current = L.polyline(path, style).addTo(map);
        }
      } else if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      const boundsPath = path.length > 0 ? path : stops.map((s) => [s.position.lat, s.position.lng] as [number, number]);
      if (driver) boundsPath.push([driver.lat, driver.lng]);

      const currentFitKey = fitKey ?? stops.map((s) => s.id).join(",");
      if (currentFitKey && fitAppliedKey.current !== currentFitKey && boundsPath.length > 0) {
        fitAppliedKey.current = currentFitKey;
        const latLngs = boundsPath.map(([lat, lng]) => L.latLng(lat, lng)) as LeafletLatLng[];
        if (latLngs.length === 1) {
          map.setView(latLngs[0], 13, { animate: true });
        } else {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 13, animate: true });
        }
      }
    }
  }

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.lat, driver?.lng, stops, routePath, routes, fitKey]);

  return (
    <div className={`driver-map-root ${className ?? ""}`}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function pickInitialCenter(driver: LatLng | null, stops: StopMarker[]): [number, number] {
  if (driver) return [driver.lat, driver.lng];
  if (stops.length > 0) return [stops[0].position.lat, stops[0].position.lng];
  return FALLBACK_CENTER;
}
