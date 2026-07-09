"use client";

import { useEffect, useRef } from "react";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";

export type LatLng = { lat: number; lng: number };

type Props = {
  driver: LatLng | null;
  destination: LatLng | null;
  /** Optional label for the destination popup */
  destinationLabel?: string | null;
  className?: string;
};

const FALLBACK_CENTER: [number, number] = [39.5, -98.35];

export default function NextTaskMap({
  driver,
  destination,
  destinationLabel,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const driverMarkerRef = useRef<LeafletMarker | null>(null);
  const destMarkerRef = useRef<LeafletMarker | null>(null);
  const lineRef = useRef<LeafletPolyline | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      leafletRef.current = L;

      const initial: [number, number] =
        driver ? [driver.lat, driver.lng]
        : destination ? [destination.lat, destination.lng]
        : FALLBACK_CENTER;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        touchZoom: true,
        dragging: true,
        doubleClickZoom: true,
      }).setView(initial, driver || destination ? 12 : 4);

      // CARTO Voyager – bright, crisp, and free for non-commercial / dev use.
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

      // Trigger a render of markers via the second effect now that map is ready.
      // We do this by setting a no-op state? Simpler: call the syncer inline.
      syncMarkers(L, map);
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      lineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncMarkers(L: typeof import("leaflet"), map: LeafletMap) {
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

    if (destination) {
      const icon = L.divIcon({
        className: "dest-marker-wrap",
        html: '<div class="dest-marker"><span class="dest-pin"></span></div>',
        iconSize: [36, 44],
        iconAnchor: [18, 40],
      });
      if (destMarkerRef.current) {
        destMarkerRef.current
          .setLatLng([destination.lat, destination.lng])
          .setIcon(icon);
        if (destinationLabel) {
          destMarkerRef.current.bindTooltip(destinationLabel, {
            direction: "top",
            offset: [0, -36],
            opacity: 0.95,
          });
        }
      } else {
        const m = L.marker([destination.lat, destination.lng], { icon }).addTo(
          map
        );
        if (destinationLabel) {
          m.bindTooltip(destinationLabel, {
            direction: "top",
            offset: [0, -36],
            opacity: 0.95,
          });
        }
        destMarkerRef.current = m;
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    if (driver && destination) {
      const latlngs: [number, number][] = [
        [driver.lat, driver.lng],
        [destination.lat, destination.lng],
      ];
      if (lineRef.current) {
        lineRef.current.setLatLngs(latlngs);
      } else {
        lineRef.current = L.polyline(latlngs, {
          color: "#f97316",
          weight: 4,
          opacity: 0.85,
          dashArray: "8 10",
          lineCap: "round",
        }).addTo(map);
      }
      map.fitBounds(L.latLngBounds(latlngs), {
        padding: [48, 48],
        maxZoom: 13,
        animate: true,
      });
    } else {
      if (lineRef.current) {
        lineRef.current.remove();
        lineRef.current = null;
      }
      if (driver) {
        map.setView([driver.lat, driver.lng], Math.max(map.getZoom(), 13), {
          animate: true,
        });
      } else if (destination) {
        map.setView(
          [destination.lat, destination.lng],
          Math.max(map.getZoom(), 12),
          { animate: true }
        );
      }
    }
  }

  // Sync markers whenever inputs change.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    syncMarkers(L, map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    driver?.lat,
    driver?.lng,
    destination?.lat,
    destination?.lng,
    destinationLabel,
  ]);

  return (
    <div className={`driver-map-root ${className ?? ""}`}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
