"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { clearSession, getToken } from "@/lib/auth-storage";
import {
  AssignedLoad,
  fetchMyLoads,
  fetchLoadRoute,
  LoadStop,
  refreshLoadSchedule,
  updateDriverLoadStop,
  UpdateLoadStopAction,
} from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { signOutDriverFirebase } from "@/lib/firebase-auth";
import { ScheduleStatusPill } from "@/components/schedule-status-pill";
import { findStopSchedule, formatMinutesLate, primaryLoadScheduleStatus } from "@/lib/schedule-status";
import {
  countPhaseScanned,
  scanPhaseForStopType,
  scanPageHref,
} from "@/lib/package-scan";
import type { LatLng, StopMarker } from "@/components/load-stops-map";

const LoadStopsMap = dynamic(() => import("@/components/load-stops-map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type DecoratedStop = { stop: LoadStop; rawIndex: number };

function formatStopType(t: string | undefined) {
  if (!t) return "Stop";
  return t.replace(/_/g, " ");
}

function addressLines(s: LoadStop): string[] {
  const line1 = [s.address].filter(Boolean).join(" ").trim();
  const cityLine = [s.city, s.state, s.zip].filter(Boolean).join(", ").trim();
  const lines: string[] = [];
  if (line1) lines.push(line1);
  if (cityLine) lines.push(cityLine);
  return lines;
}

/** Universal Google Maps directions link — opens the app on mobile, web otherwise. */
function mapsDirectionsUrl(s: LoadStop): string | null {
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

function stopNumberForApi(stop: LoadStop, rawIndex: number): number {
  return stop.stopNumber ?? rawIndex + 1;
}

function sortStopsForDisplay(stops: LoadStop[]): DecoratedStop[] {
  const raw = stops ?? [];
  const decorated = raw.map((stop, rawIndex) => ({ stop, rawIndex }));
  decorated.sort((a, b) => {
    const an = stopNumberForApi(a.stop, a.rawIndex);
    const bn = stopNumberForApi(b.stop, b.rawIndex);
    return an - bn;
  });
  return decorated;
}

function statusLabel(status: string | undefined) {
  switch (status) {
    case "en_route":
      return "En route";
    case "arrived":
      return "Arrived";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

function stopStatusTone(status: string | undefined): "neutral" | "track" | "accent" | "success" | "warning" {
  switch (status) {
    case "en_route":
      return "track";
    case "arrived":
      return "accent";
    case "completed":
      return "success";
    case "skipped":
    case "failed":
      return "warning";
    default:
      return "neutral";
  }
}

function stopToLatLng(s: LoadStop): LatLng | null {
  if (!s.coordinates || s.coordinates.length < 2) return null;
  const [lng, lat] = s.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function stopMarkerType(type: string | undefined): StopMarker["type"] {
  switch (type) {
    case "pickup":
      return "pickup";
    case "delivery":
      return "delivery";
    case "warehouse":
      return "warehouse";
    default:
      return "stop";
  }
}

function stopMarkerStatus(status: string | undefined): StopMarker["status"] {
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

export default function LoadDetailPage() {
  const params = useParams<{ loadId: string }>();
  const router = useRouter();
  const { stopTracking, lastPosition } = useLocationTracking();
  const loadId = params.loadId;

  const [load, setLoad] = useState<AssignedLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string | null>(null);
  const [stopError, setStopError] = useState<{ stopNum: number; message: string } | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][] | undefined>(undefined);
  const [etaRefreshing, setEtaRefreshing] = useState(false);

  const handleSessionExpired = useCallback(() => {
    stopTracking();
    clearSession();
    void signOutDriverFirebase();
    router.replace("/login");
  }, [router, stopTracking]);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setError(null);
    try {
      const res = await fetchMyLoads();
      const found = res.data.loads.find((l) => l._id === loadId) ?? null;
      setLoad(found);
      if (!found) setError("This load is not on your active list anymore.");
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      throw e;
    }
  }, [loadId, router, handleSessionExpired]);

  const onRefreshEta = useCallback(async () => {
    if (!loadId || etaRefreshing) return;
    setEtaRefreshing(true);
    setError(null);
    try {
      const summary = await refreshLoadSchedule(loadId);
      setLoad((prev) => (prev ? { ...prev, scheduleSummary: summary } : prev));
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not update ETA");
    } finally {
      setEtaRefreshing(false);
    }
  }, [loadId, etaRefreshing, handleSessionExpired]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    fetchMyLoads()
      .then((res) => {
        if (cancelled) return;
        const found = res.data.loads.find((l) => l._id === loadId) ?? null;
        setLoad(found);
        if (!found) setError("Load not found or you are not assigned to it.");
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && e.message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadId, router, handleSessionExpired]);

  useEffect(() => {
    if (!loadId || !getToken()) return;
    let cancelled = false;
    fetchLoadRoute(loadId)
      .then((data) => {
        if (cancelled) return;
        if (data?.status === "ready" && data.routes?.length) {
          const primary = data.routes.find((r) => r.primary) ?? data.routes[0];
          if (primary?.geometry?.coordinates?.length) {
            setRoutePath(primary.geometry.coordinates);
          }
        }
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [loadId]);

  const decoratedStops = useMemo(() => sortStopsForDisplay(load?.stops ?? []), [load?.stops]);

  const stopMarkers: StopMarker[] = useMemo(() => {
    const result: StopMarker[] = [];
    for (const { stop, rawIndex } of decoratedStops) {
      const pos = stopToLatLng(stop);
      if (!pos) continue;
      result.push({
        id: `${stopNumberForApi(stop, rawIndex)}`,
        position: pos,
        number: stopNumberForApi(stop, rawIndex),
        type: stopMarkerType(stop.type),
        status: stopMarkerStatus(stop.stopStatus),
        isCurrent: !!stop.isCurrentStop,
        label: [stop.city, stop.state].filter(Boolean).join(", ") || stop.address || formatStopType(stop.type),
      });
    }
    return result;
  }, [decoratedStops]);

  const fitKey = useMemo(
    () => stopMarkers.map((m) => m.id).join("|") + (lastPosition ? "+driver" : "") + (routePath ? "+route" : ""),
    [stopMarkers, lastPosition, routePath]
  );

  const applyStopAction = async (
    rawIndex: number,
    stop: LoadStop,
    action: UpdateLoadStopAction,
    extra?: { packagesCount?: number; signature?: string }
  ) => {
    const num = stopNumberForApi(stop, rawIndex);
    const key = `${loadId}-${num}-${action}`;
    setMutating(key);
    setError(null);
    setStopError(null);
    try {
      await updateDriverLoadStop(loadId, num, { action, ...extra });
      await refresh();
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      const msg = e instanceof Error ? e.message : "Update failed";
      if (action === "arrived" && msg.includes("away from this stop")) {
        setStopError({ stopNum: num, message: msg });
      } else {
        setError(msg);
      }
    } finally {
      setMutating(null);
    }
  };

  const completeStop = async (rawIndex: number, stop: LoadStop) => {
    const num = stopNumberForApi(stop, rawIndex);
    const packages = load?.scanPackages ?? [];
    const phase = scanPhaseForStopType(stop.type);

    if (load?.requiresScanning) {
      const scanned = countPhaseScanned(packages, phase);
      if (scanned < packages.length) {
        setStopError({
          stopNum: num,
          message: `Scan all pieces first (${scanned}/${packages.length})`,
        });
        return;
      }
    }

    let signature: string | undefined;
    if (stop.type === "delivery") {
      const sig = window.prompt("Recipient name for delivery signature:");
      if (!sig?.trim()) {
        setStopError({ stopNum: num, message: "Signature is required to complete delivery" });
        return;
      }
      signature = sig.trim();
    }

    const packagesCount = load?.requiresScanning
      ? packages.length
      : Math.max(1, stop.packagesCount ?? 1);

    await applyStopAction(rawIndex, stop, "completed", { packagesCount, signature });
  };

  const title =
    load?.loadNumber?.trim() || load?.referenceNumber?.trim() || (loadId ? loadId.slice(-8) : "Load");

  const completedCount = decoratedStops.filter(
    ({ stop }) => stop.stopStatus === "completed" || stop.stopStatus === "skipped"
  ).length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[color:var(--canvas)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Link
            href="/home"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--ink)] shadow-sm"
            aria-label="Back to loads"
          >
            <BackIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[13px] font-semibold tracking-tight text-[color:var(--ink)]">
              {title}
            </p>
            {load?.customerName ? (
              <p className="truncate text-[11px] text-[color:var(--ink-muted)]">
                {load.customerName}
              </p>
            ) : null}
          </div>
          {load?.scheduleSummary ? (
            <span className="shrink-0">
              <ScheduleStatusPill
                status={primaryLoadScheduleStatus(load.scheduleSummary)}
              />
            </span>
          ) : null}
        </div>
      </header>

      {/* Map */}
      <div className="relative h-[500px] w-full shrink-0 border-b border-[color:var(--line)]">
        <LoadStopsMap driver={lastPosition} stops={stopMarkers} routePath={routePath} fitKey={fitKey} />
      </div>

      {/* Content */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
        {loading && !load ? (
          <div className="flex justify-center py-12">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
          </div>
        ) : null}

        {error && !load ? (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--danger-soft)", color: "var(--danger)" }}
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {load ? (
          <div>
            {/* Summary strip */}
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">
                  {decoratedStops.length} stops · {completedCount} done
                </p>
                <p className="mt-1 truncate text-[15px] font-semibold text-[color:var(--ink)]">
                  {load.customerName || "Load"}
                </p>
                {load.currentStopLocation ? (
                  <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-secondary)]">
                    <span className="font-semibold text-[color:var(--ink)]">Now · </span>
                    {load.currentStopLocation}
                  </p>
                ) : load.nextStopLocation ? (
                  <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-muted)]">
                    <span className="font-semibold text-[color:var(--ink-secondary)]">Next · </span>
                    {load.nextStopLocation}
                  </p>
                ) : null}
              </div>
              <ProgressDial total={decoratedStops.length} done={completedCount} />
            </div>

            {error ? (
              <div
                className="mb-4 rounded-2xl border px-3.5 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--danger-soft)", color: "var(--danger)" }}
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {load.specialInstructions ? (
              <div
                className="mb-4 rounded-2xl border-l-4 bg-[color:var(--accent-soft)]/40 px-3.5 py-2.5 text-sm leading-relaxed"
                style={{ borderLeftColor: "var(--accent)" }}
              >
                <span className="font-semibold text-[color:var(--ink)]">Instructions · </span>
                <span className="text-[color:var(--ink-secondary)]">{load.specialInstructions}</span>
              </div>
            ) : null}

            {load.scheduleSummary?.warehouse?.requiredArrivalDisplay ? (
              <div className="mb-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-3.5 py-2.5 text-[13px] text-[color:var(--ink-secondary)]">
                <span className="font-semibold text-[color:var(--ink)]">Warehouse · </span>
                Be at fleet lot by {load.scheduleSummary.warehouse.requiredArrivalDisplay}
                {load.scheduleSummary.warehouse.predictedDisplay ? (
                  <span className="text-[color:var(--ink-muted)]">
                    {" "}· ETA {load.scheduleSummary.warehouse.predictedDisplay}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
                Route · {decoratedStops.length} stops
              </h2>
              <button
                type="button"
                disabled={etaRefreshing}
                onClick={() => void onRefreshEta()}
                className="driver-btn-ghost flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-45"
              >
                <RefreshIcon className={etaRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                {etaRefreshing ? "Updating…" : "Update ETA"}
              </button>
            </div>

            <ol className="relative pb-8">
              {decoratedStops.map(({ stop, rawIndex }, displayIdx) => {
                const num = stopNumberForApi(stop, rawIndex);
                const status = stop.stopStatus ?? "pending";
                const lines = addressLines(stop);
                const busy = mutating !== null;
                const thisBusy = (action: string) => mutating === `${loadId}-${num}-${action}`;

                const prevStopsDone = decoratedStops
                  .slice(0, displayIdx)
                  .every(({ stop: prev }) => {
                    const s = prev.stopStatus ?? "pending";
                    return s === "arrived" || s === "completed" || s === "skipped" || s === "failed";
                  });

                const canEnRoute = status === "pending" && prevStopsDone;
                const canArrived = status === "en_route";
                const canArrivedActions = status === "arrived";
                const scanPackages = load.scanPackages ?? [];
                const scanPhase = scanPhaseForStopType(stop.type);
                const scannedCount = load.requiresScanning
                  ? countPhaseScanned(scanPackages, scanPhase)
                  : 0;
                const scanTotal = scanPackages.length;
                const scansComplete = !load.requiresScanning || scannedCount >= scanTotal;
                const canComplete = canArrivedActions && scansComplete;
                const isLast = displayIdx === decoratedStops.length - 1;
                const tone = stopStatusTone(status);

                return (
                  <li key={`${rawIndex}-${displayIdx}`} className="relative flex gap-3 pb-6 last:pb-0">
                    {!isLast ? (
                      <div
                        className="absolute left-[15px] top-9 bottom-0 w-px bg-gradient-to-b from-[color:var(--line)] to-transparent"
                        aria-hidden
                      />
                    ) : null}
                    <div className="relative z-[1] shrink-0">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-md ring-4 ring-[color:var(--canvas)] ${stop.isCurrentStop
                          ? "bg-gradient-to-br from-[color:var(--accent-bright)] to-[color:var(--accent-deep)]"
                          : status === "completed"
                            ? "bg-gradient-to-br from-emerald-400 to-emerald-700"
                            : "bg-gradient-to-br from-zinc-500 to-zinc-700"
                          }`}
                      >
                        {num}
                      </div>
                    </div>
                    <div
                      className={`min-w-0 flex-1 overflow-hidden rounded-2xl border bg-[color:var(--surface)] shadow-sm transition ${stop.isCurrentStop
                        ? "border-[color:var(--accent)]/40 ring-1 ring-[color:var(--accent)]/20"
                        : "border-[color:var(--line)]"
                        }`}
                    >
                      {stop.isCurrentStop ? (
                        <div className="h-1 w-full bg-gradient-to-r from-[color:var(--accent-bright)] to-[color:var(--accent-deep)]" />
                      ) : null}
                      <div className="p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--ink-muted)]">
                              {formatStopType(stop.type)}
                            </p>
                            {stop.isCurrentStop ? (
                              <span className="inline-flex items-center rounded-lg bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--accent-deep)]">
                                Current
                              </span>
                            ) : null}
                          </div>
                          <StatusChip label={statusLabel(status)} tone={tone} />
                        </div>

                        {/* Address + navigation */}
                        <div className="mt-2.5 flex items-stretch gap-3">
                          <div className="flex min-w-0 flex-1 gap-2">
                            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ink-muted)]" />
                            <div className="min-w-0 space-y-0.5 text-[15px] font-semibold leading-snug text-[color:var(--ink)]">
                              {lines.length > 0 ? (
                                lines.map((line) => <p key={line}>{line}</p>)
                              ) : (
                                <p className="font-medium text-[color:var(--ink-muted)]">No address on file</p>
                              )}
                            </div>
                          </div>
                          {(() => {
                            const url = mapsDirectionsUrl(stop);
                            if (!url) return null;
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Navigate to ${formatStopType(stop.type)}`}
                                className="flex w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] py-2 text-[color:var(--accent-deep)] transition hover:border-[color:var(--accent)]/35 active:scale-95"
                              >
                                <NavigationIcon className="h-[18px] w-[18px]" />
                                <span className="text-[9px] font-bold uppercase tracking-wide">Go</span>
                              </a>
                            );
                          })()}
                        </div>

                        {/* Due + ETA */}
                        {(() => {
                          const sched = findStopSchedule(load.scheduleSummary, num);
                          const dueDisplay =
                            sched?.scheduledDisplay ??
                            ([stop.date, stop.time].filter(Boolean).join(" · ") || null);
                          const etaDisplay = sched?.predictedDisplay ?? null;
                          const showEnableLocation =
                            !etaDisplay && !load.scheduleSummary?.driverLocationAvailable;
                          if (!dueDisplay && !etaDisplay && !showEnableLocation) return null;
                          const isLate = !!sched && sched.status === "late";
                          const atRisk = !!sched && sched.status === "at_risk";
                          const etaToneClass = isLate
                            ? "border-[color:var(--danger)]/25 bg-[color:var(--danger-soft)]"
                            : atRisk
                              ? "border-amber-400/30 bg-amber-50"
                              : "border-[color:var(--line)] bg-[color:var(--canvas-muted)]/40";
                          return (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--canvas-muted)]/40 px-3 py-2">
                                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--ink-muted)]">
                                  Due
                                </p>
                                <p className="mt-0.5 text-[13px] font-semibold text-[color:var(--ink)]">
                                  {dueDisplay ?? "—"}
                                </p>
                              </div>
                              <div className={`rounded-xl border px-3 py-2 ${etaToneClass}`}>
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--ink-muted)]">
                                    ETA
                                  </p>
                                  {sched ? <ScheduleStatusPill status={sched.status} /> : null}
                                </div>
                                {etaDisplay ? (
                                  <>
                                    <p className="mt-0.5 text-[13px] font-semibold text-[color:var(--ink)]">
                                      {etaDisplay}
                                    </p>
                                    {sched && sched.minutesLate > 0 ? (
                                      <p className="text-[11px] font-semibold text-[color:var(--danger)]">
                                        {formatMinutesLate(sched.minutesLate)}
                                      </p>
                                    ) : null}
                                  </>
                                ) : (
                                  <p className="mt-0.5 text-[12px] text-[color:var(--ink-muted)]">
                                    {showEnableLocation ? "Enable location" : "—"}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Call coordinator */}
                        {stop.contactPhone ? (
                          <a
                            href={`tel:${stop.contactPhone}`}
                            className="group mt-3 flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--canvas-muted)]/30 px-3 py-2.5 transition active:scale-[0.99]"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
                              <PhoneIcon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold text-[color:var(--ink)]">
                                Call {stop.contactName || "coordinator"}
                              </span>
                              <span className="block font-mono text-[12px] text-[color:var(--ink-muted)]">
                                {stop.contactPhone}
                              </span>
                            </span>
                            <ChevronRightIcon className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition group-active:translate-x-0.5" />
                          </a>
                        ) : stop.contactName ? (
                          <p className="mt-3 text-[13px] text-[color:var(--ink-secondary)]">
                            {stop.contactName}
                          </p>
                        ) : null}

                        {stop.notes ? (
                          <p className="mt-2 border-t border-[color:var(--line)] pt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
                            {stop.notes}
                          </p>
                        ) : null}

                      {(canEnRoute || canArrived) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canEnRoute ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onEnRoute(rawIndex, stop)}
                              className="driver-btn-track flex h-10 flex-1 items-center justify-center gap-2 px-3 text-sm sm:flex-none sm:px-5"
                            >
                              {thisBusy("en_route") ? <MiniSpinner /> : null}
                              {thisBusy("en_route") ? "Updating…" : "En route"}
                            </button>
                          ) : null}
                          {canArrived ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onArrived(rawIndex, stop)}
                              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--accent)]/35 bg-[color:var(--surface)] px-3 text-sm font-semibold text-[color:var(--accent-deep)] transition hover:border-[color:var(--accent)]/55 active:scale-[0.98] disabled:opacity-45 sm:flex-none sm:px-5"
                            >
                              {thisBusy("arrived") ? <MiniSpinner variant="dark" /> : null}
                              {thisBusy("arrived") ? "Updating…" : "Arrived"}
                            </button>
                          ) : null}
                        </div>
                      )}

                      {canArrivedActions && load.requiresScanning && scanTotal > 0 ? (
                        <div className="mt-3 space-y-2.5 rounded-xl border border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)]/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)]">
                                Package scanning
                              </p>
                              <p className="mt-0.5 font-mono text-[15px] font-semibold text-[color:var(--accent)]">
                                {scannedCount}/{scanTotal} scanned
                              </p>
                            </div>
                            {!scansComplete ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-900">
                                Required
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-800">
                                Done
                              </span>
                            )}
                          </div>
                          <Link
                            href={scanPageHref(loadId, num)}
                            className="driver-btn-primary flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold"
                          >
                            <ScanIcon className="h-4 w-4" />
                            {scansComplete ? "Review scans" : "Open scanner"}
                          </Link>
                        </div>
                      ) : null}

                      {canComplete ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onComplete(rawIndex, stop)}
                            className="driver-btn-primary flex h-10 w-full items-center justify-center gap-2 px-4 text-sm"
                          >
                            {thisBusy("completed") ? <MiniSpinner /> : null}
                            {thisBusy("completed") ? "Completing…" : `Complete ${formatStopType(stop.type)}`}
                          </button>
                        </div>
                      ) : null}

                      {canArrivedActions && load.requiresScanning && !scansComplete ? (
                        <p className="mt-2 text-[11px] text-[color:var(--ink-muted)]">
                          Complete stop after all {scanTotal} codes are scanned.
                        </p>
                      ) : null}

                      {stopError && stopError.stopNum === num && (
                        <div
                          className="mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug"
                          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                          role="alert"
                        >
                          <LocationPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{stopError.message}</span>
                        </div>
                      )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </main>
    </div>
  );

  function onEnRoute(rawIndex: number, stop: LoadStop) {
    void applyStopAction(rawIndex, stop, "en_route");
  }
  function onArrived(rawIndex: number, stop: LoadStop) {
    void applyStopAction(rawIndex, stop, "arrived");
  }
  function onComplete(rawIndex: number, stop: LoadStop) {
    void completeStop(rawIndex, stop);
  }
}

function ProgressDial({ total, done }: { total: number; done: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="30" cy="30" r={r} fill="none" stroke="var(--accent)" strokeWidth="5"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-[color:var(--ink)]">
        {pct}%
      </span>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="h-full w-full animate-pulse bg-gradient-to-br from-[color:var(--canvas-muted)] via-[color:var(--canvas)] to-[color:var(--canvas-muted)]" />
  );
}

function StatusChip({ label, tone }: { label: string; tone: "neutral" | "track" | "accent" | "success" | "warning" }) {
  const map = {
    neutral: "bg-zinc-500/10 text-zinc-700",
    track: "bg-teal-500/15 text-teal-800",
    accent: "bg-orange-500/15 text-orange-900",
    success: "bg-emerald-500/15 text-emerald-900",
    warning: "bg-amber-500/15 text-amber-950",
  } as const;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[tone]}`}>
      {label}
    </span>
  );
}

function MiniSpinner({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (variant === "dark") {
    return (
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--accent)]/25 border-t-[color:var(--accent)]"
        aria-hidden
      />
    );
  }
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />;
}

function BackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function NavigationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M2.5 10.4 21 3l-7.4 18.5-2.6-7.9z" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ScanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 8h10v8H7V8z" />
    </svg>
  );
}

function LocationPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}
