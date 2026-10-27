// Imported only from client components, so no "use client" boundary here.
import { useCallback, useEffect, useState } from "react";

import { closeLoadIssue, DriverIssue, fetchLoadIssues, reportLoadIssue } from "@/lib/driver-api";
import { ActionSheet } from "@/components/action-sheet";
import { MenuRow } from "@/components/menu-row";

const QUICK_REASONS = [
  "Stuck in traffic",
  "Truck breakdown",
  "Waiting at dock (detention)",
  "Shipper/receiver closed",
  "Load not ready",
  "Weather / road closed",
];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Problems on a load: see what you reported, mark it resolved or delete it,
 * or report a new one (dispatch gets a critical alert).
 */
export function ReportProblemButton({
  loadId,
  onSessionExpired,
  variant = "row",
}: {
  loadId: string;
  onSessionExpired: () => void;
  variant?: "row" | "tile";
}) {
  const [issues, setIssues] = useState<DriverIssue[]>([]);
  const [view, setView] = useState<"closed" | "list" | "new">("closed");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") return onSessionExpired();
      setError(e instanceof Error ? e.message : fallback);
    },
    [onSessionExpired]
  );

  useEffect(() => {
    let cancelled = false;
    fetchLoadIssues(loadId)
      .then((list) => !cancelled && setIssues(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadId]);

  const open = issues.filter((i) => i.status === "active");
  const resolved = issues.filter((i) => i.status === "resolved").slice(0, 3);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy("new");
    setError(null);
    try {
      await reportLoadIssue(loadId, text.trim());
      setIssues(await fetchLoadIssues(loadId));
      setReason("");
      setView("list");
    } catch (e) {
      handleError(e, "Could not send. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const close = async (id: string, mode: "resolve" | "delete") => {
    setBusy(id);
    setError(null);
    setConfirmDelete(null);
    try {
      setIssues(await closeLoadIssue(loadId, id, mode));
    } catch (e) {
      handleError(e, "Could not update. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const onRowTap = () => {
    setError(null);
    setView(issues.length > 0 ? "list" : "new");
  };

  return (
    <>
      <MenuRow
        variant={variant}
        icon="⚠️"
        label="Problems"
        detail={open.length > 0 ? `${open.length} open` : null}
        tone={open.length > 0 ? "warning" : "danger"}
        onClick={onRowTap}
      />

      <ActionSheet open={view === "list"} title="Problems" onClose={() => setView("closed")}>
        <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
          {open.map((i) => (
            <div key={i._id} className="rounded-2xl bg-[color:var(--warning-soft)] p-4">
              <p className="text-[16px] font-semibold text-[color:var(--ink)]">{i.reason || "Problem reported"}</p>
              <p className="mt-0.5 text-[13px] text-amber-900">
                Open · {timeAgo(i.createdAt)}
                {i.photoCount ? ` · ${i.photoCount} photo${i.photoCount === 1 ? "" : "s"}` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void close(i._id, "resolve")}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl bg-emerald-600 text-[15px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === i._id ? "…" : "✓ Resolved"}
                </button>
                {confirmDelete === i._id ? (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void close(i._id, "delete")}
                    className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[color:var(--danger)] text-[15px] font-semibold text-white disabled:opacity-50"
                  >
                    Delete it?
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setConfirmDelete(i._id)}
                    aria-label="Delete report"
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[18px] disabled:opacity-50"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}

          {resolved.map((i) => (
            <div key={i._id} className="flex items-center gap-3 rounded-2xl bg-[color:var(--canvas)] px-4 py-3">
              <span aria-hidden>✅</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-[color:var(--ink-secondary)]">{i.reason || "Problem"}</span>
                <span className="block text-[12px] text-[color:var(--ink-muted)]">Resolved {timeAgo(i.resolvedAt)}</span>
              </span>
              {confirmDelete === i._id ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void close(i._id, "delete")}
                  className="shrink-0 text-[14px] font-semibold text-[color:var(--danger)]"
                >
                  Delete?
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setConfirmDelete(i._id)}
                  aria-label="Delete report"
                  className="shrink-0 text-[16px] opacity-60"
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>

        {error ? <p className="mt-3 text-[14px] text-[color:var(--danger)]">{error}</p> : null}

        <button
          type="button"
          onClick={() => {
            setError(null);
            setView("new");
          }}
          className="driver-btn-ghost mt-4 flex h-14 w-full items-center justify-center text-[16px] font-semibold"
        >
          {open.length > 0 ? "Update problem" : "+ Report new problem"}
        </button>
      </ActionSheet>

      <ActionSheet
        open={view === "new"}
        title={open.length > 0 ? "What's happening now?" : "What's wrong?"}
        onClose={() => setView(issues.length > 0 ? "list" : "closed")}
      >
        <div className="grid grid-cols-2 gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={!!busy}
              onClick={() => void send(r)}
              className="rounded-2xl bg-[color:var(--canvas)] px-3 py-3.5 text-left text-[15px] font-medium text-[color:var(--ink)] active:scale-[0.98] disabled:opacity-50"
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
            disabled={!!busy || !reason.trim()}
            className="driver-btn-primary h-12 shrink-0 px-4 text-[15px] font-semibold"
          >
            {busy === "new" ? "…" : "Send"}
          </button>
        </form>
        {error ? <p className="mt-2 text-[14px] text-[color:var(--danger)]">{error}</p> : null}
      </ActionSheet>
    </>
  );
}
