"use client";

import { useEffect, useRef } from "react";
import type { LatLng as LeafletLatLng, Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

import { normalizeLatLng } from "@/lib/coordinates";

export type PickerPosition = { lat: number; lng: number };

type Props = {
  position: PickerPosition | null;
  onPick: (pos: PickerPosition) => void;
  /** Increment to pan the map to `position` without changing zoom (e.g. device GPS). */
  recenterTrigger?: number;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [49.2827, -123.1207];

export default function LocationPickerMap({ position, onPick, recenterTrigger, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const initial: [number, number] = position
        ? [position.lat, position.lng]
        : DEFAULT_CENTER;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView(initial, position ? 13 : 4);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      map.on("click", (e) => {
        try {
          onPickRef.current(normalizeLatLng(e.latlng.lat, e.latlng.lng));
        } catch {
          /* ignore invalid pick */
        }
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    void (async () => {
      const L = (await import("leaflet")).default;

      if (!position) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }

      const latLng: LeafletLatLng = L.latLng(position.lat, position.lng);

      if (markerRef.current) {
        markerRef.current.setLatLng(latLng);
      } else {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50%;background:#0ea5e9;border:3px solid #fff;box-shadow:0 4px 12px rgba(14,165,233,0.45)"></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        markerRef.current = L.marker(latLng, { icon }).addTo(map);
        map.setView(latLng, 13);
      }
    })();
  }, [position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || recenterTrigger == null || recenterTrigger === 0) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      const latLng = L.latLng(position.lat, position.lng);
      map.panTo(latLng, { animate: true });
    })();
  }, [recenterTrigger, position]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[320px] w-full rounded-2xl border border-[color:var(--line)]"}
    />
  );
}
