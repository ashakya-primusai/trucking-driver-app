"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import { AssignedLoad, fetchMyLoads, MyLoadsResponse } from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { activeStop, loadCode, loadRouteLabel, stopStatusLabel, stopTypeLabel } from "@/lib/load-stops";
import { primaryLoadScheduleStatus } from "@/lib/schedule-status";
import { useSignOut } from "@/lib/use-sign-out";
import { BottomTabNav } from "@/components/bottom-tab-nav";
import { Logo } from "@/components/Logo";
import { NextStepCard } from "@/components/next-step-card";
import { ScheduleStatusPill } from "@/components/schedule-status-pill";

/** Load the driver is working right now: one already in progress, else the newest assignment. */
function pickCurrentLoad(loads: AssignedLoad[]): AssignedLoad | null {
  return (
    loads.find((l) => {
      const s = activeStop(l)?.stop.stopStatus;
      return s === "en_route" || s === "arrived";
    }) ??
    loads[0] ??
    null
  );
}

export default function HomePage() {
  const router = useRouter();
  const signOut = useSignOut();
  const { isTracking, startTracking } = useLocationTracking();
  const [data, setData] = useState<MyLoadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    (p: Promise<{ data: MyLoadsResponse }>) =>
      p
        .then((res) => {
          setData(res.data);
          setError(null);
        })
        .catch((e) => {
          if (e instanceof Error && e.message === "SESSION_EXPIRED") return signOut();
          setError(e instanceof Error ? e.message : "Could not load your loads");
        })
        .finally(() => {
          setRefreshing(false);
          setLoading(false);
        }),
    [signOut]
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    await apply(fetchMyLoads());
  }, [apply]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void apply(fetchMyLoads());
  }, [apply, router]);

  const loads = useMemo(() => data?.loads ?? [], [data]);
  const current = useMemo(() => pickCurrentLoad(loads), [loads]);
  const others = loads.filter((l) => l._id !== current?._id);
  const firstName = (data?.driver?.fullName || "Driver").split(" ")[0];

  return (
    <div className="app-shell flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <Logo size="nav" href="/home" className="shrink-0" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="driver-btn-ghost h-10 px-3 text-[14px] font-semibold disabled:opacity-50"
            >
              {refreshing ? "Updating…" : "Refresh"}
            </button>
            <Link
              href="/settings"
              className="driver-btn-ghost flex h-10 w-10 items-center justify-center text-[color:var(--ink-muted)]"
              aria-label="Settings"
            >
              <MenuIcon />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-[color:var(--ink)]">Hi {firstName}</h1>

        {!isTracking ? (
          <button
            type="button"
            onClick={startTracking}
            className="flex items-center gap-3 rounded-2xl border border-sky-400/40 bg-[color:var(--track-soft)] px-4 py-3.5 text-left"
          >
            <span className="h-3 w-3 shrink-0 rounded-full bg-[color:var(--ink-faint)]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[color:var(--ink)]">Location is off</span>
              <span className="block text-[13px] text-[color:var(--ink-secondary)]">
                Tap to share — needed for ETAs and “I&apos;ve arrived”.
              </span>
            </span>
          </button>
        ) : (
          <p className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--ink-secondary)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--track)]" aria-hidden />
            Sharing location with dispatch
          </p>
        )}

        {error ? (
          <p className="rounded-2xl bg-[color:var(--danger-soft)] px-4 py-3 text-[14px] text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-[color:var(--canvas-muted)]" aria-busy />
        ) : null}

        {!loading && data && loads.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] px-6 py-12 text-center">
            <p className="text-[17px] font-semibold text-[color:var(--ink)]">No loads right now</p>
            <p className="mx-auto mt-2 max-w-xs text-[14px] text-[color:var(--ink-muted)]">
              When dispatch assigns you a load it shows up here.
            </p>
          </div>
        ) : null}

        {current ? (
          <section>
            <h2 className="mb-2 text-[15px] font-semibold text-[color:var(--ink)]">Next step</h2>
            <NextStepCard load={current} onChanged={load} onSessionExpired={signOut} linkToLoad />
            <Link
              href={`/load/${current._id}`}
              className="mt-2 block text-center text-[14px] font-semibold text-[color:var(--accent-deep)] no-underline"
            >
              All stops, paperwork &amp; problems ›
            </Link>
          </section>
        ) : null}

        {others.length > 0 ? (
          <section>
            <h2 className="mb-2 text-[15px] font-semibold text-[color:var(--ink)]">Coming up</h2>
            <ul className="flex flex-col gap-2">
              {others.map((l) => {
                const next = activeStop(l);
                return (
                  <li key={l._id}>
                    <Link href={`/load/${l._id}`} className="load-row block no-underline">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-mono text-[14px] font-semibold text-[color:var(--ink)]">{loadCode(l)}</p>
                          {l.scheduleSummary ? (
                            <ScheduleStatusPill status={primaryLoadScheduleStatus(l.scheduleSummary)} />
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-[13px] text-[color:var(--ink-secondary)]">{loadRouteLabel(l)}</p>
                        {next ? (
                          <p className="mt-0.5 text-[12px] text-[color:var(--ink-muted)]">
                            {stopTypeLabel(next.stop.type)} · {stopStatusLabel(next.stop.stopStatus)}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[20px] text-[color:var(--ink-faint)]" aria-hidden>›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>

      <BottomTabNav />
    </div>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
