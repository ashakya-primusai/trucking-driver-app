"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getToken } from "@/lib/auth-storage";
import { AssignedLoad, fetchMyLoads, LoadStop } from "@/lib/driver-api";
import { activeStop, loadCode, placeShort, sortedStops, stopTypeLabel } from "@/lib/load-stops";
import { findStopSchedule } from "@/lib/schedule-status";
import { useSignOut } from "@/lib/use-sign-out";
import { LoadMap } from "@/components/load-map";
import { LoadPaperwork } from "@/components/load-paperwork";
import { NextStepCard } from "@/components/next-step-card";
import { ReportProblemButton } from "@/components/report-problem-button";
import { MenuRow } from "@/components/menu-row";

function stopDot(stop: LoadStop): string {
  if (stop.stopStatus === "completed") return "bg-emerald-600";
  if (stop.stopStatus === "en_route" || stop.stopStatus === "arrived") return "bg-[color:var(--accent)]";
  return "bg-zinc-400";
}

export default function LoadDetailPage() {
  const { loadId } = useParams<{ loadId: string }>();
  const router = useRouter();
  const signOut = useSignOut();

  const [load, setLoad] = useState<AssignedLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const stops = useMemo(() => sortedStops(load), [load]);
  const current = activeStop(load);

  // Backend appends "Stuck reported (driver): …" notes for dispatch — the driver already knows.
  const instructions = (load?.specialInstructions ?? "")
    .split(/\n+/)
    .filter((line) => !line.trim().startsWith("Stuck reported (driver):"))
    .join(" ")
    .trim();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[color:var(--canvas)]">
      <LoadMap load={load} className="h-[300px]">
        <Link
          href="/home"
          aria-label="Back"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-[22px] text-[color:var(--ink)] no-underline shadow-[var(--shadow-card)]"
        >
          ‹
        </Link>
        {load ? (
          <span className="pointer-events-auto truncate rounded-full bg-white px-3.5 py-2 font-mono text-[13px] font-semibold text-[color:var(--ink)] shadow-[var(--shadow-card)]">
            {loadCode(load)}
          </span>
        ) : null}
      </LoadMap>

      <main className="relative z-10 mx-auto -mt-8 flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-10">
        {loading && !load ? (
          <div className="flex justify-center rounded-3xl bg-[color:var(--surface)] py-12 shadow-[var(--shadow-floating)]">
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

            {instructions ? (
              <div className="flex gap-3 rounded-2xl bg-[color:var(--surface)] px-4 py-3.5 text-[14px] leading-snug text-[color:var(--ink-secondary)]">
                <span aria-hidden>📝</span>
                <span>{instructions}</span>
              </div>
            ) : null}

            <ol className="rounded-2xl bg-[color:var(--surface)] px-4 py-2">
              {stops.map(({ stop, num }, i) => {
                const sched = findStopSchedule(load.scheduleSummary, num);
                const when = sched?.scheduledDisplay ?? ([stop.date, stop.time].filter(Boolean).join(" ") || null);
                const isCurrent = current?.num === num;
                const isLast = i === stops.length - 1;
                return (
                  <li key={num} className="relative flex gap-3 py-2.5">
                    {!isLast ? (
                      <span className="absolute left-[13px] top-[38px] bottom-[-10px] w-0.5 bg-[color:var(--line-strong)]" aria-hidden />
                    ) : null}
                    <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${stopDot(stop)}`}>
                      {stop.stopStatus === "completed" ? "✓" : num}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[16px] ${isCurrent ? "font-semibold text-[color:var(--ink)]" : "text-[color:var(--ink-secondary)]"}`}>
                        {placeShort(stop)}
                      </p>
                      <p className="truncate text-[13px] text-[color:var(--ink-muted)]">
                        {[stopTypeLabel(stop.type), when].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="divide-y divide-[color:var(--line)] overflow-hidden rounded-2xl bg-[color:var(--surface)]">
              <LoadPaperwork loadId={load._id} onSessionExpired={signOut} />
              <MenuRow icon="🗺️" label="Trip plan" detail="Fuel & ETAs" href={`/plan?load=${load._id}`} />
              <ReportProblemButton loadId={load._id} onSessionExpired={signOut} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
