"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import { AssignedLoad, fetchLoadPlan, fetchMyLoads, LoadPlan } from "@/lib/driver-api";
import { formatDuration, formatMiles, loadCode, placeShort, sortedStops, stopStatusLabel, stopTypeLabel } from "@/lib/load-stops";
import { findStopSchedule, formatMinutesLate } from "@/lib/schedule-status";
import { useSignOut } from "@/lib/use-sign-out";
import { BottomTabNav } from "@/components/bottom-tab-nav";
import { ScheduleStatusPill } from "@/components/schedule-status-pill";

const KM_TO_MI = 0.621371;

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanScreen />
    </Suspense>
  );
}

/** Trip plan: miles, drive time, fuel stops and every stop's due time vs ETA — one load at a time. */
function PlanScreen() {
  const router = useRouter();
  const signOut = useSignOut();
  const params = useSearchParams();
  const [loads, setLoads] = useState<AssignedLoad[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("load"));
  const [plan, setPlan] = useState<LoadPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    fetchMyLoads()
      .then((res) => {
        setLoads(res.data.loads);
        setSelectedId((id) => (id && res.data.loads.some((l) => l._id === id) ? id : res.data.loads[0]?._id ?? null));
      })
      .catch((e) => {
        if (e instanceof Error && e.message === "SESSION_EXPIRED") return signOut();
        setError(e instanceof Error ? e.message : "Could not load");
      });
  }, [router, signOut]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetchLoadPlan(selectedId)
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && e.message === "SESSION_EXPIRED") return signOut();
        setError(e instanceof Error ? e.message : "Could not load plan");
        setPlan({ loadId: selectedId, route: null, fuel: null, scheduleSummary: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, signOut]);

  const load = loads?.find((l) => l._id === selectedId) ?? null;
  // Plan for a different load (or none yet) means the new one is still loading.
  const planLoading = !!selectedId && plan?.loadId !== selectedId;
  const current = planLoading ? null : plan;
  const schedule = current?.scheduleSummary ?? load?.scheduleSummary;
  const fuel = current?.fuel ?? null;
  const yard = schedule?.warehouse;

  return (
    <div className="app-shell flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
        <h1 className="mx-auto max-w-lg text-[17px] font-semibold text-[color:var(--ink)]">Trip plan</h1>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-5">
        {error ? (
          <p className="rounded-2xl bg-[color:var(--danger-soft)] px-4 py-3 text-[14px] text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {loads && loads.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-[color:var(--ink-muted)]">No loads assigned, so nothing to plan.</p>
        ) : null}

        {loads && loads.length > 1 ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {loads.map((l) => (
              <button
                key={l._id}
                type="button"
                onClick={() => setSelectedId(l._id)}
                className={`shrink-0 rounded-full border px-4 py-2 font-mono text-[13px] font-semibold ${
                  l._id === selectedId
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                    : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)]"
                }`}
              >
                {loadCode(l)}
              </button>
            ))}
          </div>
        ) : null}

        {load ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Tile
                label="Distance"
                value={
                  current?.route?.distanceMeters != null
                    ? formatMiles(current.route.distanceMeters)
                    : fuel
                      ? `${Math.round(fuel.totalDistanceKm * KM_TO_MI).toLocaleString()} mi`
                      : planLoading ? "…" : "—"
                }
              />
              <Tile
                label="Drive time"
                value={current?.route?.durationSec != null ? formatDuration(current.route.durationSec) : planLoading ? "…" : "—"}
              />
              <Tile
                label="Fuel stops"
                value={fuel ? String(fuel.stops.length) : planLoading ? "…" : "—"}
              />
            </div>

            {current?.route?.trafficDelaySec ? (
              <p className="-mt-2 text-[13px] text-amber-800">
                Traffic adds about {Math.round(current.route.trafficDelaySec / 60)} min.
              </p>
            ) : null}

            {yard?.requiredArrivalDisplay ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-[14px] text-[color:var(--ink-secondary)]">
                <b className="text-[color:var(--ink)]">Yard:</b> be there by {yard.requiredArrivalDisplay}
                {yard.predictedDisplay ? ` · your ETA ${yard.predictedDisplay}` : ""}
              </div>
            ) : null}

            <section>
              <h2 className="mb-2 text-[15px] font-semibold text-[color:var(--ink)]">Stops</h2>
              {schedule?.schedulePending ? (
                <p className="mb-2 text-[13px] text-[color:var(--ink-muted)]">Working out ETAs…</p>
              ) : !schedule?.driverLocationAvailable ? (
                <p className="mb-2 text-[13px] text-[color:var(--ink-muted)]">Turn on location to see ETAs.</p>
              ) : null}
              <ol className="flex flex-col gap-2">
                {sortedStops(load).map(({ stop, num }) => {
                  const s = findStopSchedule(schedule, num);
                  const due = s?.scheduledDisplay ?? ([stop.date, stop.time].filter(Boolean).join(" ") || "—");
                  return (
                    <li key={num} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[15px] font-semibold text-[color:var(--ink)]">
                          {num}. {stopTypeLabel(stop.type)} · {placeShort(stop)}
                        </p>
                        {s ? <ScheduleStatusPill status={s.status} /> : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 text-[13px] text-[color:var(--ink-secondary)]">
                        <span>Due <b className="text-[color:var(--ink)]">{due}</b></span>
                        {s?.predictedDisplay ? <span>ETA <b className="text-[color:var(--ink)]">{s.predictedDisplay}</b></span> : null}
                        <span className="text-[color:var(--ink-muted)]">{stopStatusLabel(stop.stopStatus)}</span>
                      </div>
                      {s && s.minutesLate > 0 ? (
                        <p className="mt-1 text-[13px] font-semibold text-[color:var(--danger)]">{formatMinutesLate(s.minutesLate)}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            <section>
              <h2 className="mb-2 text-[15px] font-semibold text-[color:var(--ink)]">Fuel</h2>
              {planLoading ? (
                <p className="text-[14px] text-[color:var(--ink-muted)]">Planning fuel…</p>
              ) : !fuel ? (
                <p className="text-[14px] text-[color:var(--ink-muted)]">Fuel plan not available for this load yet.</p>
              ) : fuel.canCompleteWithoutRefueling || fuel.stops.length === 0 ? (
                <p className="rounded-2xl bg-[color:var(--success-soft)] px-4 py-3 text-[14px] font-medium text-emerald-800">
                  No fuel stop needed on a full tank.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {fuel.stops.map((f) => (
                    <li key={f.stopNumber} className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3">
                      <span>
                        <span className="block text-[15px] font-semibold text-[color:var(--ink)]">
                          Fuel up in {f.inStateName || f.inState}
                        </span>
                        <span className="block text-[13px] text-[color:var(--ink-muted)]">
                          around mile {Math.round(f.atKm * KM_TO_MI).toLocaleString()}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[13px] text-[color:var(--ink-secondary)]">
                        ~{Math.round(f.litresNeeded * 0.264172)} gal
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <Link
              href={`/load/${load._id}`}
              className="driver-btn-primary flex h-14 w-full items-center justify-center text-[16px] font-semibold no-underline"
            >
              Open load
            </Link>
          </>
        ) : null}
      </main>

      <BottomTabNav />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)]">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tabular-nums text-[color:var(--ink)]">{value}</p>
    </div>
  );
}
