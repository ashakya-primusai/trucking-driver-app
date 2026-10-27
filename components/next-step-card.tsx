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
  stopStatusLabel,
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
      <div className="rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--surface)] p-5 text-center shadow-[var(--shadow-card)]">
        <p className="text-[17px] font-semibold text-[color:var(--ink)]">All stops done</p>
        <p className="mt-1 text-[14px] text-[color:var(--ink-muted)]">
          Upload any missing paperwork below. Dispatch will close the load.
        </p>
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
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--accent)]/30 bg-[color:var(--surface)] shadow-[var(--shadow-card)]">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--accent-deep)]">
            {stopTypeLabel(stop.type)} · {stopStatusLabel(stop.stopStatus)}
          </p>
          {sched ? <ScheduleStatusPill status={sched.status} /> : null}
        </div>

        {linkToLoad ? (
          <Link href={`/load/${load._id}`} className="mt-1 block font-mono text-[13px] font-semibold text-[color:var(--ink-muted)] no-underline">
            Load {loadCode(load)} ›
          </Link>
        ) : null}

        <div className="mt-2 text-[18px] font-semibold leading-snug text-[color:var(--ink)]">
          {lines.length > 0 ? lines.map((l) => <p key={l}>{l}</p>) : <p>No address on file</p>}
        </div>

        {due || eta ? (
          <p className="mt-2 text-[14px] text-[color:var(--ink-secondary)]">
            {due ? <>Due <b className="text-[color:var(--ink)]">{due}</b></> : null}
            {due && eta ? " · " : null}
            {eta ? <>ETA <b className="text-[color:var(--ink)]">{eta}</b></> : null}
            {sched && sched.minutesLate > 0 ? (
              <span className="ml-1 font-semibold text-[color:var(--danger)]">({formatMinutesLate(sched.minutesLate)})</span>
            ) : null}
          </p>
        ) : null}

        {stop.notes ? (
          <p className="mt-2 rounded-xl bg-[color:var(--canvas-muted)] px-3 py-2 text-[13px] text-[color:var(--ink-secondary)]">
            {stop.notes}
          </p>
        ) : null}

        {needsScan ? (
          <Link
            href={scanPageHref(load._id, num)}
            className="driver-btn-primary mt-4 flex h-14 w-full items-center justify-center text-[16px] font-semibold no-underline"
          >
            Scan pieces ({scanned}/{packages.length})
          </Link>
        ) : action ? (
          <button
            type="button"
            disabled={busy}
            onClick={onPrimary}
            className={`${action === "en_route" ? "driver-btn-track" : "driver-btn-primary"} mt-4 flex h-14 w-full items-center justify-center gap-2 text-[16px] font-semibold`}
          >
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            {busy ? "Saving…" : actionLabel(action, stop)}
          </button>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-xl bg-[color:var(--danger-soft)] px-3 py-2 text-[14px] text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {navUrl ? (
            <a href={navUrl} target="_blank" rel="noopener noreferrer" className="driver-btn-ghost flex h-12 items-center justify-center text-[15px] font-semibold no-underline">
              Navigate
            </a>
          ) : <span />}
          {stop.contactPhone ? (
            <a href={`tel:${stop.contactPhone}`} className="driver-btn-ghost flex h-12 items-center justify-center text-[15px] font-semibold no-underline">
              Call {stop.contactName?.split(" ")[0] || "site"}
            </a>
          ) : <span />}
        </div>
      </div>

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
          <p className="mt-2 text-[13px] text-[color:var(--ink-muted)]">
            Then take a photo of the signed POD in Paperwork.
          </p>
          {error ? <p className="mt-2 text-[14px] text-[color:var(--danger)]">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !recipient.trim()}
            className="driver-btn-primary mt-4 flex h-14 w-full items-center justify-center text-[16px] font-semibold"
          >
            {busy ? "Saving…" : "Finish delivery"}
          </button>
        </form>
      </ActionSheet>
    </div>
  );
}
