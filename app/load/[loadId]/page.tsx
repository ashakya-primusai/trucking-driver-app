"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import { AssignedLoad, fetchLoadRoute, fetchMyLoads, LoadStop } from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import {
  activeStop,
  loadCode,
  mapsDirectionsUrl,
  placeShort,
  sortedStops,
  stopStatusLabel,
  stopTypeLabel,
} from "@/lib/load-stops";
import { findStopSchedule, primaryLoadScheduleStatus } from "@/lib/schedule-status";
import { useSignOut } from "@/lib/use-sign-out";
import { LoadPaperwork } from "@/components/load-paperwork";
import { NextStepCard } from "@/components/next-step-card";
import { ReportProblemButton } from "@/components/report-problem-button";
import { ScheduleStatusPill } from "@/components/schedule-status-pill";
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

function stopDot(stop: LoadStop): string {
  if (stop.stopStatus === "completed") return "bg-emerald-600";
  if (stop.stopStatus === "en_route" || stop.stopStatus === "arrived") return "bg-[color:var(--accent)]";
  return "bg-zinc-400";
}

export default function LoadDetailPage() {
  const { loadId } = useParams<{ loadId: string }>();
  const router = useRouter();
  const signOut = useSignOut();
  const { lastPosition } = useLocationTracking();

  const [load, setLoad] = useState<AssignedLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][] | undefined>(undefined);

  const apply = useCallback(
    (p: Promise<{ data: { loads: AssignedLoad[] } }>) =>
      p
        .then((res) => {
          const found = res.data.loads.find((l) => l._id === loadId) ?? null;
          setLoad(found);
          setError(found ? null : "This load is no longer on your list.");
        })
        .catch((e) => {
          if (e instanceof Error && e.message === "SESSION_EXPIRED") return signOut();
          setError(e instanceof Error ? e.message : "Could not load");
        })
        .finally(() => setLoading(false)),
    [loadId, signOut]
  );

  const refresh = useCallback(() => apply(fetchMyLoads()), [apply]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void apply(fetchMyLoads());
  }, [apply, router]);

  useEffect(() => {
    if (!loadId || !getToken()) return;
    let cancelled = false;
    fetchLoadRoute(loadId)
      .then((data) => {
        if (cancelled || data?.status !== "ready" || !data.routes?.length) return;
        const primary =
          data.assignedRouteIndex != null && data.routes[data.assignedRouteIndex]
            ? data.routes[data.assignedRouteIndex]
            : data.routes.find((r) => r.primary) ?? data.routes[0];
        if (primary?.geometry?.coordinates?.length) setRoutePath(primary.geometry.coordinates);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadId]);

  const stops = useMemo(() => sortedStops(load), [load]);
  const current = activeStop(load);

  const markers: StopMarker[] = useMemo(
    () =>
      stops.flatMap(({ stop, num }) => {
        const [lng, lat] = stop.coordinates ?? [NaN, NaN];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        return [
          {
            id: String(num),
            position: { lat, lng },
            number: num,
            type: markerType(stop.type),
            status: markerStatus(stop.stopStatus),
            isCurrent: current?.num === num,
            label: placeShort(stop),
          },
        ];
      }),
    [stops, current?.num]
  );

  const fitKey = markers.map((m) => m.id).join("|") + (lastPosition ? "+d" : "") + (routePath ? "+r" : "");
  const done = stops.filter(({ stop }) => stop.stopStatus === "completed" || stop.stopStatus === "skipped").length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[color:var(--canvas)]">
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Link
            href="/home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--line)] bg-white text-[20px] text-[color:var(--ink)] no-underline"
            aria-label="Back"
          >
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[15px] font-semibold text-[color:var(--ink)]">
              {load ? loadCode(load) : "Load"}
            </p>
            <p className="truncate text-[12px] text-[color:var(--ink-muted)]">
              {stops.length} stops · {done} done{load?.customerName ? ` · ${load.customerName}` : ""}
            </p>
          </div>
          {load?.scheduleSummary ? <ScheduleStatusPill status={primaryLoadScheduleStatus(load.scheduleSummary)} /> : null}
        </div>
      </header>

      <div className="relative h-[220px] w-full shrink-0 border-b border-[color:var(--line)]">
        <LoadStopsMap driver={lastPosition} stops={markers} routePath={routePath} fitKey={fitKey} />
      </div>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-5 pb-10">
        {loading && !load ? (
          <div className="flex justify-center py-12">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-[color:var(--danger-soft)] px-4 py-3 text-[14px] text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {load ? (
          <>
            <NextStepCard load={load} onChanged={refresh} onSessionExpired={signOut} />

            {load.specialInstructions ? (
              <div className="rounded-2xl border-l-4 border-[color:var(--accent)] bg-[color:var(--accent-soft)] px-4 py-3 text-[14px] leading-relaxed text-[color:var(--ink-secondary)]">
                <b className="text-[color:var(--ink)]">Instructions: </b>
                {load.specialInstructions}
              </div>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">All stops</h2>
                <Link href={`/plan?load=${load._id}`} className="text-[14px] font-semibold text-[color:var(--accent-deep)] no-underline">
                  Trip plan ›
                </Link>
              </div>
              <ol className="divide-y divide-[color:var(--line)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)]">
                {stops.map(({ stop, num }) => {
                  const sched = findStopSchedule(load.scheduleSummary, num);
                  const when = sched?.predictedDisplay ?? sched?.scheduledDisplay ?? ([stop.date, stop.time].filter(Boolean).join(" ") || null);
                  const nav = mapsDirectionsUrl(stop);
                  return (
                    <li key={num} className={`flex items-center gap-3 px-4 py-3 ${current?.num === num ? "bg-[color:var(--accent-soft)]" : ""}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${stopDot(stop)}`}>
                        {num}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[color:var(--ink)]">
                          {stopTypeLabel(stop.type)} · {placeShort(stop)}
                        </p>
                        <p className="truncate text-[12px] text-[color:var(--ink-muted)]">
                          {stopStatusLabel(stop.stopStatus)}
                          {when ? ` · ${sched?.predictedDisplay ? "ETA" : "Due"} ${when}` : ""}
                        </p>
                      </div>
                      {nav && stop.stopStatus !== "completed" ? (
                        <a href={nav} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[13px] font-semibold text-[color:var(--accent-deep)] no-underline">
                          Go
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            <LoadPaperwork loadId={load._id} onSessionExpired={signOut} />

            <ReportProblemButton loadId={load._id} onSessionExpired={signOut} />
          </>
        ) : null}
      </main>
    </div>
  );
}
