"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import { normalizeLatLng } from "@/lib/coordinates";
import { updateDriverLocation } from "@/lib/driver-api";
import {
  clearEmulatedLocation,
  getEmulatedLocation,
  isEmulationEnabled,
  setEmulatedLocation,
  setEmulationEnabled,
} from "@/lib/location-emulation";
import { useLocationTracking } from "@/lib/location-tracking-context";
import type { PickerPosition } from "@/components/location-picker-map";

const LocationPickerMap = dynamic(() => import("@/components/location-picker-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full animate-pulse rounded-2xl border border-[color:var(--line)] bg-[color:var(--canvas-muted)]" />
  ),
});

export default function SettingsLocationPage() {
  const router = useRouter();
  const { isTracking, lastPosition } = useLocationTracking();
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setEnabled(isEmulationEnabled());
  }, [router]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    const savedPos = getEmulatedLocation();
    if (savedPos) {
      bootstrappedRef.current = true;
      setPosition(savedPos);
      return;
    }
    if (lastPosition) {
      bootstrappedRef.current = true;
      setPosition(lastPosition);
    }
  }, [lastPosition]);

  const handleSave = useCallback(async () => {
    if (!position) {
      setError("Tap the map to choose a location.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { lat, lng } = normalizeLatLng(position.lat, position.lng);
      setEmulatedLocation(lat, lng);
      setEmulationEnabled(true);
      setEnabled(true);
      await updateDriverLocation(lng, lat);
      setPosition({ lat, lng });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save location");
    } finally {
      setSaving(false);
    }
  }, [position]);

  const handleUseDeviceGps = useCallback(() => {
    clearEmulatedLocation();
    setEnabled(false);
    setSaved(false);
    setError(null);
  }, []);

  const handleUseCurrentGps = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          const { lat, lng } = normalizeLatLng(pos.coords.latitude, pos.coords.longitude);
          setPosition({ lat, lng });
          setRecenterTrigger((n) => n + 1);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid GPS coordinates");
        }
      },
      (err) => setError(err.message || "Could not read GPS"),
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }, []);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--ink-muted)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
            aria-label="Back"
          >
            <BackIcon />
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-[color:var(--ink)]">Location</h1>
            <p className="text-[11px] text-[color:var(--ink-muted)]">Emulate GPS for testing</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-4">
        <LocationPickerMap
          position={position}
          onPick={setPosition}
          recenterTrigger={recenterTrigger}
        />

        <p className="text-[13px] text-[color:var(--ink-muted)]">
          Tap anywhere on the map to set your emulated position.
        </p>

        {position ? (
          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[13px] text-[color:var(--ink-secondary)]">
            <span className="text-[color:var(--ink-muted)]">Lat </span>
            {position.lat.toFixed(6)}
            <span className="mx-2 text-[color:var(--ink-muted)]">·</span>
            <span className="text-[color:var(--ink-muted)]">Lng </span>
            {position.lng.toFixed(6)}
          </div>
        ) : null}

        {enabled ? (
          <p className="rounded-xl border border-[color:var(--accent-soft)] bg-[color:var(--accent-soft)] px-4 py-2.5 text-[13px] text-[color:var(--accent-deep)]">
            Emulation is on — live tracking will use this point instead of device GPS.
            {isTracking ? " Tracking is active." : ""}
          </p>
        ) : null}

        {error ? (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--danger) 25%, transparent)",
              background: "var(--danger-soft)",
              color: "var(--danger)",
            }}
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {saved ? (
          <p className="text-center text-[13px] font-medium text-[color:var(--success)]">
            Location saved and sent to server.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={saving || !position}
            onClick={() => void handleSave()}
            className="driver-btn-primary w-full px-4 py-3 text-[15px] disabled:opacity-45"
          >
            {saving ? "Saving…" : "Save & enable emulation"}
          </button>
          <button
            type="button"
            onClick={handleUseCurrentGps}
            className="driver-btn-ghost w-full px-4 py-3 text-[14px]"
          >
            Use device GPS as pick point
          </button>
          {enabled ? (
            <button
              type="button"
              onClick={handleUseDeviceGps}
              className="w-full py-2 text-[13px] font-medium text-[color:var(--ink-muted)] transition hover:text-[color:var(--ink-secondary)]"
            >
              Disable emulation — use real GPS
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
