// Imported only from client components, so no "use client" boundary here.
import { useState } from "react";

import { reportLoadIssue } from "@/lib/driver-api";
import { ActionSheet } from "@/components/action-sheet";

const QUICK_REASONS = [
  "Stuck in traffic",
  "Truck breakdown",
  "Waiting at dock (detention)",
  "Shipper/receiver closed",
  "Load not ready",
  "Weather / road closed",
];

/** "Report a problem" → pick a reason (or type one) → dispatch gets a critical alert. */
export function ReportProblemButton({
  loadId,
  onSessionExpired,
}: {
  loadId: string;
  onSessionExpired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await reportLoadIssue(loadId, text.trim());
      setSent(true);
      setOpen(false);
      setReason("");
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") return onSessionExpired();
      setError(e instanceof Error ? e.message : "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
        className="mx-auto flex items-center gap-1.5 py-2 text-[14px] font-semibold text-[color:var(--danger)]"
      >
        ⚠ Report a problem
      </button>
      {sent ? (
        <p className="mt-2 text-center text-[14px] font-medium text-emerald-700">Dispatch has been alerted.</p>
      ) : null}

      <ActionSheet open={open} title="What's wrong?" onClose={() => setOpen(false)}>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => void send(r)}
              className="rounded-2xl border border-[color:var(--line)] px-3 py-3 text-left text-[14px] font-medium text-[color:var(--ink)] active:bg-[color:var(--canvas-muted)] disabled:opacity-50"
            >
              {r}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(reason);
          }}
        >
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Or type what happened"
            className="driver-input h-12 min-w-0 flex-1 px-3 text-[15px]"
          />
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className="driver-btn-primary h-12 shrink-0 px-4 text-[15px] font-semibold"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
        {error ? <p className="mt-2 text-[14px] text-[color:var(--danger)]">{error}</p> : null}
      </ActionSheet>
    </>
  );
}
