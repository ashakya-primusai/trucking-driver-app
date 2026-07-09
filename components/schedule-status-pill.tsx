import type { LatenessStatus } from "@/lib/driver-api";
import { scheduleStatusLabel, scheduleStatusTone } from "@/lib/schedule-status";

export function ScheduleStatusPill({ status }: { status: LatenessStatus }) {
  const tone = scheduleStatusTone(status);
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
        : tone === "danger"
          ? "bg-red-500/15 text-red-700 dark:text-red-300"
          : "bg-[color:var(--surface)] text-[color:var(--ink-muted)]";

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${toneClass}`}
    >
      {scheduleStatusLabel(status)}
    </span>
  );
}
