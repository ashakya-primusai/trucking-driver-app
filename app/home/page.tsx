"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import { AssignedLoad, fetchMyLoads, MyLoadsResponse } from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { activeStop, loadCode, loadRouteLabel } from "@/lib/load-stops";
import { primaryLoadScheduleStatus } from "@/lib/schedule-status";
import { useSignOut } from "@/lib/use-sign-out";
import { BottomTabNav } from "@/components/bottom-tab-nav";
import { LoadMap } from "@/components/load-map";
import { LoadPaperwork } from "@/components/load-paperwork";
import { MenuRow } from "@/components/menu-row";
import { ReportProblemButton } from "@/components/report-problem-button";
import { RouteTimeline } from "@/components/route-timeline";
import { TripStats } from "@/components/trip-stats";
import { Logo } from "@/components/Logo";
import { NextStepCard } from "@/components/next-step-card";
import { ChatIcon, ClipboardIcon } from "@/components/icons";

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
  const { isTracking, startTracking, stopTracking } = useLocationTracking();
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
  // Driver's pick from the switcher; falls back to the load in progress (or newest) when unset or gone.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = useMemo(
    () => loads.find((l) => l._id === selectedId) ?? pickCurrentLoad(loads),
    [loads, selectedId]
  );

  return (
    <div className="app-shell flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <Logo size="nav" href="/home" className="shrink-0" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (isTracking ? stopTracking() : void startTracking())}
              className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
                isTracking
                  ? "border-sky-400/40 bg-[color:var(--track-soft)] text-sky-800"
                  : "border-[color:var(--line)] bg-white text-[color:var(--ink-muted)]"
              }`}
              aria-label={isTracking ? "Stop sharing location" : "Share location"}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${isTracking ? "bg-[color:var(--track)]" : "bg-[color:var(--ink-faint)]"}`} aria-hidden />
              {isTracking ? "Live" : "Off"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="driver-btn-ghost flex h-10 w-10 items-center justify-center text-[color:var(--ink-muted)] disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshIcon spinning={refreshing} />
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

      {loads.length > 1 ? (
        <LoadSwitcher loads={loads} selectedId={current?._id ?? null} onSelect={setSelectedId} />
      ) : null}

      {current ? <LoadMap key={current._id} load={current} className="h-[280px]" /> : null}

      <main className={`relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-4 pb-24 ${current ? "-mt-8" : "pt-5"}`}>
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
          </div>
        ) : null}

        {current ? (
          <section>
            <NextStepCard key={current._id} load={current} onChanged={load} onSessionExpired={signOut} linkToLoad />
          </section>
        ) : null}

        {current ? (
          <>
            <TripStats loadId={current._id} />

            <div className="grid grid-cols-2 gap-2">
              <LoadPaperwork key={`docs-${current._id}`} loadId={current._id} onSessionExpired={signOut} variant="tile" />
              <ReportProblemButton key={`issues-${current._id}`} loadId={current._id} onSessionExpired={signOut} variant="tile" />
              <MenuRow variant="tile" icon={<ChatIcon />} label="Ask Bella" href="/chat" />
              <MenuRow variant="tile" icon={<ClipboardIcon />} label="Load details" href={`/load/${current._id}`} />
            </div>

            <RouteTimeline load={current} />
          </>
        ) : null}

      </main>

      <BottomTabNav />
    </div>
  );
}

/** One chip per assigned load — tap to switch what the map, card and tiles show. */
function LoadSwitcher({
  loads,
  selectedId,
  onSelect,
}: {
  loads: AssignedLoad[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-b border-[color:var(--line)] bg-[color:var(--surface)]">
      <div className="mx-auto flex max-w-lg gap-2 overflow-x-auto px-4 py-2.5">
        {loads.map((l, i) => {
          const selected = l._id === selectedId;
          const status = l.scheduleSummary ? primaryLoadScheduleStatus(l.scheduleSummary) : "unknown";
          const inProgress = ["en_route", "arrived"].includes(activeStop(l)?.stop.stopStatus ?? "");
          const dot = status === "late" ? "bg-red-500" : inProgress ? "bg-[color:var(--accent)]" : "bg-zinc-400";
          return (
            <button
              key={l._id}
              type="button"
              onClick={() => onSelect(l._id)}
              aria-pressed={selected}
              className={`flex max-w-[220px] shrink-0 flex-col rounded-2xl border px-3.5 py-2 text-left ${
                selected
                  ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-white"
                  : "border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--ink)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                <span className="truncate text-[14px] font-semibold">{loadRouteLabel(l)}</span>
              </span>
              <span className={`mt-0.5 truncate font-mono text-[11px] ${selected ? "text-white/70" : "text-[color:var(--ink-muted)]"}`}>
                {i + 1}/{loads.length} · {loadCode(l)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
