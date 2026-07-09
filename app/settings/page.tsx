"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import {
  getEmulatedLocation,
  isEmulationEnabled,
} from "@/lib/location-emulation";
import { BottomTabNav } from "@/components/bottom-tab-nav";

export default function SettingsPage() {
  const router = useRouter();
  const [emulationOn, setEmulationOn] = useState(false);
  const [emulated, setEmulated] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const sync = () => {
      setEmulationOn(isEmulationEnabled());
      setEmulated(getEmulatedLocation());
    };
    sync();
    window.addEventListener("driver:emulated-location-changed", sync);
    return () => window.removeEventListener("driver:emulated-location-changed", sync);
  }, [router]);

  return (
    <div className="app-shell flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--ink-muted)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
            aria-label="Back"
          >
            <BackIcon />
          </button>
          <h1 className="text-[15px] font-semibold text-[color:var(--ink)]">Settings</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--ink-muted)]">
          Developer
        </p>
        <ul className="divide-y divide-[color:var(--line)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)]">
          <li>
            <Link
              href="/settings/location"
              className="flex items-center justify-between gap-3 px-4 py-4 no-underline transition hover:bg-[color:var(--canvas-muted)]"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-[color:var(--ink)]">Location</p>
                <p className="mt-0.5 text-[13px] text-[color:var(--ink-muted)]">
                  Pick a point on the map to emulate GPS
                </p>
              </div>
              <div className="shrink-0 text-right">
                {emulationOn ? (
                  <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent-deep)]">
                    On
                  </span>
                ) : (
                  <span className="text-[12px] text-[color:var(--ink-muted)]">Off</span>
                )}
                {emulated ? (
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--ink-muted)]">
                    {emulated.lat.toFixed(4)}, {emulated.lng.toFixed(4)}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        </ul>
      </main>

      <BottomTabNav />
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
