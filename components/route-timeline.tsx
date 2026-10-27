import type { AssignedLoad, LoadStop } from "@/lib/driver-api";
import { activeStop, placeShort, sortedStops, stopTypeLabel } from "@/lib/load-stops";
import { findStopSchedule } from "@/lib/schedule-status";

function stopDot(stop: LoadStop): string {
  if (stop.stopStatus === "completed") return "bg-emerald-600";
  if (stop.stopStatus === "en_route" || stop.stopStatus === "arrived") return "bg-[color:var(--accent)]";
  return "bg-zinc-400";
}

/** All stops of a load as a vertical timeline: dot · city · type and due time. */
export function RouteTimeline({ load }: { load: AssignedLoad }) {
  const stops = sortedStops(load);
  const currentNum = activeStop(load)?.num;

  return (
    <ol className="rounded-2xl bg-[color:var(--surface)] px-4 py-2">
      {stops.map(({ stop, num }, i) => {
        const sched = findStopSchedule(load.scheduleSummary, num);
        const when = sched?.scheduledDisplay ?? ([stop.date, stop.time].filter(Boolean).join(" ") || null);
        const isCurrent = currentNum === num;
        return (
          <li key={num} className="relative flex gap-3 py-2.5">
            {i < stops.length - 1 ? (
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
  );
}
