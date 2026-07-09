"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clearSession, getStoredDriver, getToken, type StoredDriver } from "@/lib/auth-storage";
import {
  AssignedLoad,
  fetchMyLoads,
  fetchNavRoute,
  NavRouteResult,
  LoadStop,
  MyLoadsResponse,
  WarehouseDistance,
} from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { signOutDriverFirebase } from "@/lib/firebase-auth";
import { BottomTabNav } from "@/components/bottom-tab-nav";
import { Logo } from "@/components/Logo";
import { ScheduleStatusPill } from "@/components/schedule-status-pill";
import {
  primaryLoadScheduleStatus,
} from "@/lib/schedule-status";
import type { LatLng, StopMarker, RouteLayer } from "@/components/load-stops-map";

const LoadStopsMap = dynamic(() => import("@/components/load-stops-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-2xl bg-[color:var(--canvas-muted)]" />
  ),
});

function stopRoute(load: AssignedLoad): string {
  const stops = (load.stops ?? []).slice().sort((a, b) => (a.stopNumber ?? 0) - (b.stopNumber ?? 0));
  if (stops.length === 0) {
    return [load.pickupLocation, load.destination].filter(Boolean).join("  →  ") || "Stops not listed";
  }
  const first = stops[0];
  const last = stops[stops.length - 1];
  const start = placeShort(first);
  const end = placeShort(last);
  return start === end ? start : `${start}  →  ${end}`;
}

function placeShort(s: LoadStop | undefined): string {
  if (!s) return "—";
  return [s.city, s.state].filter(Boolean).join(", ") || s.address || (s.type ?? "Stop").replace(/_/g, " ");
}

function loadCode(load: AssignedLoad): string {
  return load.loadNumber?.trim() || load.referenceNumber?.trim() || load._id.slice(-8);
}

function loadInitials(load: AssignedLoad): string {
  const code = loadCode(load);
  const digits = code.replace(/[^0-9A-Z]/gi, "");
  return digits.slice(-2).toUpperCase() || "LD";
}

// Distinct colors for per-load route polylines
const ROUTE_COLORS = ["#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#f43f5e", "#eab308"];

function routeColorFor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDistance(meters: number): string {
  const mi = meters / 1609.34;
  if (mi >= 10) return `${Math.round(mi)} mi`;
  return `${mi.toFixed(1)} mi`;
}

type NextStopInfo = {
  loadId: string;
  loadCode: string;
  stop: LoadStop;
  stopNumber: number;
  position: LatLng;
  etaDisplay: string | null;
  scheduledDisplay: string | null;
};

function findNextStop(load: AssignedLoad): NextStopInfo | null {
  const stops = (load.stops ?? []).slice().sort((a, b) => (a.stopNumber ?? 0) - (b.stopNumber ?? 0));

  // Prefer stop that is en_route or isCurrentStop
  let target = stops.find((s) => s.stopStatus === "en_route" || s.isCurrentStop);
  // Fall back to first pending stop
  if (!target) {
    target = stops.find((s) => !s.stopStatus || s.stopStatus === "pending");
  }
  if (!target) return null;

  if (!target.coordinates || target.coordinates.length < 2) return null;
  const [lng, lat] = target.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const n = target.stopNumber;
  const num = typeof n === "number" && n > 0 ? n : stops.indexOf(target) + 1;

  // Try to find ETA from schedule summary
  let etaDisplay: string | null = null;
  let scheduledDisplay: string | null = null;
  const schedStops = load.scheduleSummary?.stops ?? [];
  const sched = schedStops.find((s) => s.stopNumber === num);
  if (sched) {
    etaDisplay = sched.predictedDisplay ?? null;
    scheduledDisplay = sched.scheduledDisplay ?? null;
  }

  return {
    loadId: load._id,
    loadCode: loadCode(load),
    stop: target,
    stopNumber: num,
    position: { lat, lng },
    etaDisplay,
    scheduledDisplay,
  };
}

export default function HomePage() {
  const router = useRouter();
  const { stopTracking, isTracking, startTracking, lastPosition } = useLocationTracking();
  const [data, setData] = useState<MyLoadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [storedDriver, setStoredDriver] = useState<StoredDriver | null>(null);

  useEffect(() => {
    setStoredDriver(getStoredDriver());
  }, []);

  const runFetch = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setError(null);
    setRefreshing(true);
    try {
      const res = await fetchMyLoads();
      setData(res.data);
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        stopTracking();
        clearSession();
        void signOutDriverFirebase();
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load assignments");
    } finally {
      setRefreshing(false);
    }
  }, [router, stopTracking]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    fetchMyLoads()
      .then((res) => {
        if (cancelled) return;
        setError(null);
        setData(res.data);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && e.message === "SESSION_EXPIRED") {
          stopTracking();
          clearSession();
          void signOutDriverFirebase();
          router.replace("/login");
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load assignments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, stopTracking]);

  const driver = data?.driver ?? null;
  const displayName = driver?.fullName || storedDriver?.fullName || "Driver";
  const firstName = displayName.split(" ")[0];
  const loads = data?.loads ?? [];

  const nextStops = useMemo(() => {
    return loads.map(findNextStop).filter((x): x is NextStopInfo => x !== null);
  }, [loads]);

  const mapStopMarkers: StopMarker[] = useMemo(() => {
    return nextStops.map((ns, i) => ({
      id: `next-${ns.loadId}`,
      position: ns.position,
      number: i + 1,
      type: (ns.stop.type === "pickup" ? "pickup" : ns.stop.type === "delivery" ? "delivery" : "stop") as StopMarker["type"],
      status: (ns.stop.stopStatus === "en_route" ? "en_route" : "pending") as StopMarker["status"],
      isCurrent: true,
      label: ns.loadCode,
    }));
  }, [nextStops]);

  const mapFitKey = useMemo(
    () => mapStopMarkers.map((m) => m.id).join("|") + (lastPosition ? "+d" : ""),
    [mapStopMarkers, lastPosition]
  );

  // Nav routes: driver → next stop for each load (calculated via TomTom)
  const [navRoutes, setNavRoutes] = useState<Record<string, NavRouteResult>>({});
  const lastNavKey = useRef<string>("");

  useEffect(() => {
    if (!lastPosition || nextStops.length === 0 || !getToken()) return;
    const key = `${lastPosition.lat.toFixed(4)},${lastPosition.lng.toFixed(4)}|${nextStops.map((n) => n.loadId).join(",")}`;
    if (key === lastNavKey.current) return;
    lastNavKey.current = key;

    let cancelled = false;
    const fetchAll = async () => {
      const results: Record<string, NavRouteResult> = {};
      await Promise.all(
        nextStops.map(async (ns) => {
          try {
            const r = await fetchNavRoute(
              lastPosition.lng, lastPosition.lat,
              ns.position.lng, ns.position.lat
            );
            if (!cancelled && r) results[ns.loadId] = r;
          } catch { /* ignore */ }
        })
      );
      if (!cancelled) setNavRoutes(results);
    };
    void fetchAll();
    return () => { cancelled = true; };
  }, [lastPosition, nextStops]);

  // Build RouteLayer[] for the map
  const routeLayers = useMemo((): RouteLayer[] => {
    return nextStops.flatMap((ns, i) => {
      const nav = navRoutes[ns.loadId];
      if (!nav?.geometry?.coordinates?.length) return [];
      return [{
        path: nav.geometry.coordinates,
        color: routeColorFor(i),
        label: ns.loadCode,
      }];
    });
  }, [nextStops, navRoutes]);

  const onLogout = () => {
    stopTracking();
    clearSession();
    void signOutDriverFirebase();
    router.replace("/login");
  };

  return (
    <div className="app-shell flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <Logo size="nav" href="/home" className="shrink-0" />
          <div className="flex shrink-0 items-center gap-2">
            <LiveStatusPill
              isTracking={isTracking}
              onToggle={() => (isTracking ? stopTracking() : startTracking())}
            />
            <button
              type="button"
              onClick={() => void runFetch()}
              disabled={refreshing}
              className="driver-btn-ghost flex h-9 w-9 items-center justify-center disabled:opacity-40"
              aria-label="Refresh"
            >
              <RefreshIcon className={refreshing ? "animate-spin" : ""} />
            </button>
            <Link
              href="/settings"
              className="driver-btn-ghost flex h-9 w-9 items-center justify-center text-[color:var(--ink-muted)]"
              aria-label="Settings"
            >
              <SettingsIcon />
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="driver-btn-ghost flex h-9 w-9 items-center justify-center text-[color:var(--ink-muted)] hover:text-[color:var(--danger)]"
              aria-label="Log out"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-5">
        <div>
          <p className="text-[13px] text-[color:var(--ink-muted)]">{greetingLabel()},</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
            {firstName}
          </h1>
        </div>

        {data?.warehouse ? <WarehouseStrip warehouse={data.warehouse} /> : null}

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Your loads</h2>
            {!loading && data ? (
              <span className="text-[13px] text-[color:var(--ink-muted)]">
                {loads.length} active
              </span>
            ) : null}
          </div>

          {loading && !data ? (
            <ul className="flex flex-col gap-2.5" aria-busy>
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="load-row animate-pulse"
                  style={{ background: "var(--canvas-muted)" }}
                  aria-hidden
                />
              ))}
            </ul>
          ) : null}

          {error ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
              style={{
                borderColor: "var(--line)",
                background: "var(--danger-soft)",
                color: "var(--danger)",
              }}
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {!loading && data && loads.length === 0 ? <EmptyState /> : null}

          {loads.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {loads.map((load) => (
                <li key={load._id}>
                  <Link
                    href={`/load/${load._id}`}
                    className="load-row group block no-underline"
                  >
                    <span className="row-leading">{loadInitials(load)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-mono text-[13px] font-semibold tracking-tight text-[color:var(--ink)]">
                          {loadCode(load)}
                        </p>
                        {load.scheduleSummary ? (
                          <ScheduleStatusPill
                            status={primaryLoadScheduleStatus(load.scheduleSummary)}
                          />
                        ) : null}
                      </div>
                      {load.customerName ? (
                        <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-secondary)]">
                          {load.customerName}
                        </p>
                      ) : null}
                      <p className="mt-1.5 truncate text-[12px] text-[color:var(--ink-muted)]">
                        {stopRoute(load)}
                      </p>
                    </div>
                    <ChevronIcon className="shrink-0 text-[color:var(--ink-muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Next stops map */}
        {nextStops.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[15px] font-semibold text-[color:var(--ink)]">Upcoming route</h2>
            <div className="overflow-hidden rounded-2xl border border-[color:var(--line)] shadow-sm">
              <div className="relative h-[260px] w-full">
                <LoadStopsMap
                  driver={lastPosition}
                  stops={mapStopMarkers}
                  routes={routeLayers.length > 0 ? routeLayers : undefined}
                  fitKey={mapFitKey}
                />
              </div>
              <div className="divide-y divide-[color:var(--line)] bg-[color:var(--surface)]">
                {nextStops.map((ns, i) => {
                  const color = routeColorFor(i);
                  const nav = navRoutes[ns.loadId];
                  const driverEta = nav ? formatDuration(nav.durationSec) : null;
                  const driverDist = nav ? formatDistance(nav.distanceMeters) : null;
                  return (
                    <Link
                      key={ns.loadId}
                      href={`/load/${ns.loadId}`}
                      className="flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-[color:var(--canvas-muted)]"
                    >
                      {/* color dot matching polyline */}
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
                        style={{ background: color }}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-mono text-[12px] font-semibold text-[color:var(--ink)]">
                            {ns.loadCode}
                          </p>
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-white"
                            style={{ background: color }}
                          >
                            {ns.stop.type === "pickup" ? "Pickup" : ns.stop.type === "delivery" ? "Delivery" : `Stop ${ns.stopNumber}`}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-muted)]">
                          {[ns.stop.city, ns.stop.state].filter(Boolean).join(", ") || ns.stop.address || "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {driverEta ? (
                          <p className="text-[13px] font-bold tabular-nums" style={{ color }}>
                            {driverEta}
                          </p>
                        ) : null}
                        {driverDist ? (
                          <p className="text-[10px] text-[color:var(--ink-muted)]">{driverDist}</p>
                        ) : null}
                        {!driverEta && ns.etaDisplay ? (
                          <p className="text-[12px] font-semibold tabular-nums text-[color:var(--ink-secondary)]">
                            {ns.etaDisplay}
                          </p>
                        ) : null}
                        {!driverEta && !ns.etaDisplay ? (
                          <p className="text-[10px] text-[color:var(--ink-muted)]">
                            {ns.stop.stopStatus === "en_route" ? "En route" : "Next"}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

      </main>

      <BottomTabNav />
    </div>
  );
}

function greetingLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function LiveStatusPill({
  isTracking,
  onToggle,
}: {
  isTracking: boolean;
  onToggle: () => void;
}) {
  const { isEmulationEnabled: emulated } = useLocationTracking();

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ink-secondary)] backdrop-blur transition hover:border-[color:var(--line-strong)]"
      aria-label={isTracking ? "Stop sharing location" : "Start sharing location"}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: isTracking ? (emulated ? "var(--accent)" : "var(--track)") : "var(--ink-faint)",
          boxShadow: isTracking
            ? `0 0 0 3px color-mix(in srgb, ${emulated ? "var(--accent)" : "var(--track)"} 25%, transparent)`
            : undefined,
        }}
        aria-hidden
      />
      {isTracking ? (emulated ? "Sim live" : "Live") : "Go live"}
    </button>
  );
}

function WarehouseStrip({ warehouse }: { warehouse: WarehouseDistance }) {
  const subtitle = warehouse.locationLabel
    ? `Fleet lot · ${warehouse.locationLabel}`
    : "Fleet lot / yard";

  let distanceText: string;
  if (warehouse.distanceDisplay) {
    distanceText = warehouse.distanceDisplay;
  } else if (!warehouse.coordinatesAvailable) {
    distanceText = "Not set";
  } else if (!warehouse.driverLocationAvailable) {
    distanceText = "Enable location";
  } else {
    distanceText = "—";
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
          From warehouse
        </p>
        <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-secondary)]">{subtitle}</p>
      </div>
      <p
        className={`shrink-0 text-[15px] font-semibold tabular-nums ${warehouse.distanceDisplay
          ? "text-[color:var(--accent)]"
          : "text-[12px] font-medium text-[color:var(--ink-muted)]"
          }`}
      >
        {distanceText}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface)]/80 px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--track-soft)] text-sky-700">
        <InboxIcon />
      </div>
      <p className="text-lg font-semibold text-[color:var(--ink)]">Nothing assigned yet</p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[color:var(--ink-muted)]">
        When dispatch assigns you a load, it will appear here. Pull sync anytime.
      </p>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-5 w-5 ${className ?? ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className ?? ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.862M18 18.75h.75v-.75H18v.75zM5.25 18.75h.75v-.75H5.25v.75zM12.75 18.75h.75v-.75h-.75v.75z"
      />
    </svg>
  );
}
