"use client";

import { formatDriverSpeedKmh } from "@/lib/derive-speed";
import { useLocationTracking } from "@/lib/location-tracking-context";

type Props = {
  /** Compact single row for load detail header */
  compact?: boolean;
};

export function LocationTrackingToggle({ compact }: Props) {
  const { isTracking, lastSentAt, lastSpeedKmh, lastError, startTracking, stopTracking } =
    useLocationTracking();

  const speedLabel = isTracking ? formatDriverSpeedKmh(lastSpeedKmh) : null;

  const lastLabel =
    lastSentAt != null
      ? `Last sent ${lastSentAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
      : null;

  if (compact) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{
              background: isTracking ? "var(--accent-bright, #14b8a6)" : "var(--ink-muted)",
            }}
            aria-hidden
          />
          <span className="text-[11px] font-medium text-[color:var(--ink-secondary)]">
            {isTracking ? "Sharing location" : "Location off"}
          </span>
          <button
            type="button"
            onClick={() => (isTracking ? stopTracking() : startTracking())}
            className="ml-auto rounded-lg bg-[color:var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
          >
            {isTracking ? "Go offline" : "Go online"}
          </button>
        </div>
        {speedLabel ? (
          <p className="text-[10px] font-medium text-[color:var(--ink-secondary)] pl-4">
            Speed · {speedLabel}
          </p>
        ) : isTracking ? (
          <p className="text-[10px] text-[color:var(--ink-muted)] pl-4">Speed · calculating…</p>
        ) : null}
        {lastLabel ? (
          <p className="text-[10px] text-[color:var(--ink-muted)] pl-4">{lastLabel}</p>
        ) : null}
        {lastError ? (
          <p className="text-[10px] leading-snug text-red-600 dark:text-red-400 pl-4">{lastError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)]/80 px-4 py-3"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              background: isTracking ? "var(--accent-bright, #14b8a6)" : "var(--ink-muted)",
              boxShadow: isTracking ? "0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent)" : undefined,
            }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--ink)]">
              {isTracking ? "Location tracking on" : "Location tracking off"}
            </p>
            <p className="text-xs text-[color:var(--ink-muted)]">
              {isTracking
                ? "Sends GPS to dispatch every 5 seconds while this app stays open."
                : "Tap Go online to share your position with dispatch."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (isTracking ? stopTracking() : startTracking())}
          className={
            isTracking
              ? "ml-auto rounded-xl border border-[color:var(--line)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)] hover:bg-[color:var(--track-soft)]"
              : "ml-auto rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          }
        >
          {isTracking ? "Go offline" : "Go online"}
        </button>
      </div>
      {isTracking ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[color:var(--line)] pt-3">
          <p className="text-sm font-semibold text-[color:var(--ink)]">
            {speedLabel ? (
              <>
                <span className="text-[color:var(--ink-muted)] font-medium">Speed </span>
                {speedLabel}
              </>
            ) : (
              <span className="text-[color:var(--ink-muted)] font-medium">Speed · calculating…</span>
            )}
          </p>
          {lastLabel ? (
            <p className="text-xs text-[color:var(--ink-muted)]">{lastLabel}</p>
          ) : null}
        </div>
      ) : lastLabel ? (
        <p className="mt-2 text-xs text-[color:var(--ink-muted)]">{lastLabel}</p>
      ) : null}
      {lastError ? (
        <p className="mt-2 text-xs leading-relaxed text-red-600 dark:text-red-400" role="alert">
          {lastError}
        </p>
      ) : null}
    </div>
  );
}
