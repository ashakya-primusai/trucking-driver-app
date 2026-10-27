// Imported only from client components, so no "use client" boundary here.
import Link from "next/link";
import { useState } from "react";

import { AssignedLoad, updateDriverLoadStop, UpdateLoadStopAction } from "@/lib/driver-api";
import {
  actionLabel,
  activeStop,
  addressLines,
  loadCode,
  mapsDirectionsUrl,
  nextActionFor,
  placeShort,
  stopTypeLabel,
} from "@/lib/load-stops";
import { countPhaseScanned, scanPageHref, scanPhaseForStopType } from "@/lib/package-scan";
import { findStopSchedule, formatMinutesLate } from "@/lib/schedule-status";
import { ScheduleStatusPill } from "@/components/schedule-status-pill";
import { ActionSheet } from "@/components/action-sheet";

type Props = {
  load: AssignedLoad;
  /** Re-fetch the load after a stop changes. */
  onChanged: () => Promise<void>;
  onSessionExpired: () => void;
  /** Show the load number as a link (home screen). */
  linkToLoad?: boolean;
};

/**
 * The one thing the driver should do next on a load: a single big button
 * (Start driving → I've arrived → Finish), plus Navigate and Call.
 */
export function NextStepCard({ load, onChanged, onSessionExpired, linkToLoad }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [recipient, setRecipient] = useState("");

  const current = activeStop(load);

  if (!current) {
    return (
      <div className="rounded-3xl bg-[color:var(--surface)] p-6 text-center shadow-[var(--shadow-floating)]">
        <p className="text-[17px] font-semibold text-[color:var(--ink)]">✓ All stops done</p>
      </div>
    );
  }

  const { stop, num } = current;
  const action = nextActionFor(stop);
  const lines = addressLines(stop);
  const navUrl = mapsDirectionsUrl(stop);
  const sched = findStopSchedule(load.scheduleSummary, num);
  const due = sched?.scheduledDisplay ?? ([stop.date, stop.time].filter(Boolean).join(" · ") || null);
  const eta = sched?.predictedDisplay ?? null;

  const packages = load.scanPackages ?? [];
  const phase = scanPhaseForStopType(stop.type);
  const scanned = load.requiresScanning ? countPhaseScanned(packages, phase) : 0;
  const needsScan = action === "completed" && !!load.requiresScanning && scanned < packages.length;

  const run = async (act: UpdateLoadStopAction, signature?: string) => {
    setBusy(true);
    setError(null);
    try {
      const packagesCount = load.requiresScanning ? packages.length : Math.max(1, stop.packagesCount ?? 1);
      await updateDriverLoadStop(load._id, num, {
        action: act,
        ...(act === "completed" ? { packagesCount, signature } : {}),
      });
      setSignOpen(false);
      setRecipient("");
      await onChanged();
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") return onSessionExpired();
      setError(e instanceof Error ? e.message : "Could not update. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = () => {
    if (!action) return;
    if (action === "completed" && stop.type === "delivery") {
      setSignOpen(true);
      return;
    }
    void run(action);
  };

  return (
    <div className="rounded-3xl bg-[color:var(--surface)] p-5 shadow-[var(--shadow-floating)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[color:var(--accent-deep)]">
          {stopTypeLabel(stop.type)}
        </span>
        {sched && sched.minutesLate > 0 ? (
          <span className="rounded-full bg-red-500/12 px-2.5 py-1 text-[12px] font-semibold text-red-700">
            {formatMinutesLate(sched.minutesLate)}
          </span>
        ) : sched ? (
          <ScheduleStatusPill status={sched.status} />
        ) : null}
      </div>

      <p className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-[color:var(--ink)]">
        {placeShort(stop)}
      </p>
      <p className="mt-1 truncate text-[15px] text-[color:var(--ink-muted)]">
        {[lines[0] !== placeShort(stop) ? lines[0] : null, due ?? eta].filter(Boolean).join(" · ")}
      </p>

      {linkToLoad ? (
        <Link href={`/load/${load._id}`} className="mt-1 inline-block font-mono text-[12px] text-[color:var(--ink-faint)] no-underline">
          {loadCode(load)} ›
        </Link>
      ) : null}

      {stop.notes ? (
        <p className="mt-3 line-clamp-2 rounded-xl bg-[color:var(--canvas)] px-3 py-2 text-[13px] text-[color:var(--ink-secondary)]">
          {stop.notes}
        </p>
      ) : null}

      <div className="mt-5 flex gap-2.5">
        {navUrl ? (
          <a href={navUrl} target="_blank" rel="noopener noreferrer" aria-label="Directions" className={ICON_BTN}>
            <NavIcon />
          </a>
        ) : null}
        {stop.contactPhone ? (
          <a href={`tel:${stop.contactPhone}`} aria-label={`Call ${stop.contactName || "site"}`} className={ICON_BTN}>
            <PhoneIcon />
          </a>
        ) : null}
        {needsScan ? (
          <Link
            href={scanPageHref(load._id, num)}
            className="driver-btn-primary flex h-14 flex-1 items-center justify-center text-[17px] font-semibold no-underline"
          >
            Scan {scanned}/{packages.length}
          </Link>
        ) : action ? (
          <button
            type="button"
            disabled={busy}
            onClick={onPrimary}
            className={`${action === "en_route" ? "driver-btn-track" : "driver-btn-primary"} flex h-14 flex-1 items-center justify-center gap-2 text-[17px] font-semibold`}
          >
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            {busy ? "Saving…" : actionLabel(action, stop)}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-[color:var(--danger-soft)] px-3 py-2 text-[14px] text-[color:var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <ActionSheet open={signOpen} title="Who received the load?" onClose={() => setSignOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (recipient.trim()) void run("completed", recipient.trim());
          }}
        >
          <input
            autoFocus
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Receiver's name"
            className="driver-input h-14 w-full px-4 text-[16px]"
          />
          {error ? <p className="mt-2 text-[14px] text-[color:var(--danger)]">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !recipient.trim()}
            className="driver-btn-primary mt-4 flex h-14 w-full items-center justify-center text-[16px] font-semibold"
          >
            {busy ? "Saving…" : "Delivered"}
          </button>
        </form>
      </ActionSheet>
    </div>
  );
}

const ICON_BTN =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--canvas)] text-[color:var(--ink)] no-underline active:scale-95";

function NavIcon() {
  return (
    <svg className="h-[22px] w-[22px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M2.5 10.4 21 3l-7.4 18.5-2.6-7.9z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}
