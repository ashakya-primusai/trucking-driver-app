// Imported only from client components, so no "use client" boundary here.
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchLoadDocuments, LoadDocumentsResponse, uploadLoadDocument } from "@/lib/driver-api";
import { prepareFileForUpload } from "@/lib/file-upload";
import { ActionSheet } from "@/components/action-sheet";
import { MenuRow } from "@/components/menu-row";

/** "Proof of Delivery (POD)" → "POD"; labels without a short form stay as-is. */
function shortLabel(label: string): string {
  return label.match(/\(([^)]+)\)\s*$/)?.[1] ?? label;
}

/**
 * Documents row for a load. Tapping it opens a sheet with what's still needed
 * (one tap → camera), what's on file, and "Add other".
 */
export function LoadPaperwork({
  loadId,
  onSessionExpired,
  variant = "row",
}: {
  loadId: string;
  onSessionExpired: () => void;
  variant?: "row" | "tile";
}) {
  const [data, setData] = useState<LoadDocumentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"closed" | "list" | "pick">("closed");
  const [uploading, setUploading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingType = useRef<string>("");

  const handleError = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") return onSessionExpired();
      setError(e instanceof Error ? e.message : fallback);
    },
    [onSessionExpired]
  );

  useEffect(() => {
    let cancelled = false;
    fetchLoadDocuments(loadId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && handleError(e, "Could not load documents"));
    return () => {
      cancelled = true;
    };
  }, [loadId, handleError]);

  const startUpload = (slug: string) => {
    pendingType.current = slug;
    setView("list");
    setError(null);
    setDone(null);
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    const slug = pendingType.current;
    if (!file || !slug) return;
    setUploading(slug);
    try {
      const prepared = await prepareFileForUpload(file);
      const next = await uploadLoadDocument(loadId, { documentType: slug, ...prepared });
      setData(next);
      setDone(next.uploadTypes.find((t) => t.slug === slug)?.label ?? "Document");
    } catch (e) {
      handleError(e, "Upload failed. Try again.");
    } finally {
      setUploading(null);
    }
  };

  const needed = (data?.checklist ?? []).filter((c) => c.state === "missing");
  const docs = data?.documents ?? [];

  const detail = uploading
    ? "Uploading…"
    : needed.length > 0
      ? `${shortLabel(needed[0].label)} needed`
      : docs.length > 0
        ? String(docs.length)
        : null;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <MenuRow
        variant={variant}
        icon="📄"
        label="Documents"
        detail={detail}
        tone={needed.length > 0 && !uploading ? "warning" : "default"}
        onClick={() => setView("list")}
      />

      <ActionSheet open={view === "list"} title="Documents" onClose={() => setView("closed")}>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {needed.map((item) => (
            <button
              key={`${item.stage}-${item.slug}`}
              type="button"
              disabled={!!uploading}
              onClick={() => startUpload(item.slug)}
              className="flex items-center gap-3 rounded-2xl bg-[color:var(--warning-soft)] px-4 py-3.5 text-left disabled:opacity-50"
            >
              <span className="text-[22px]" aria-hidden>📷</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-[color:var(--ink)]">{item.label}</span>
                <span className="block text-[13px] text-amber-900">Tap to take a photo</span>
              </span>
            </button>
          ))}

          {docs.map((d) => (
            <div key={d._id} className="flex items-center gap-3 rounded-2xl bg-[color:var(--canvas)] px-4 py-3">
              <span className="text-[18px]" aria-hidden>{d.rejected ? "⚠️" : "✅"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-[color:var(--ink)]">{d.label}</span>
                {d.rejected ? (
                  <span className="block text-[12px] text-[color:var(--danger)]">
                    Rejected{d.rejectedReason ? ` · ${d.rejectedReason}` : ""}
                  </span>
                ) : null}
              </span>
            </div>
          ))}

          {needed.length === 0 && docs.length === 0 && data ? (
            <p className="py-4 text-center text-[15px] text-[color:var(--ink-muted)]">Nothing uploaded yet</p>
          ) : null}
        </div>

        {uploading ? <p className="mt-3 text-[14px] text-[color:var(--ink-muted)]">Uploading…</p> : null}
        {done ? <p className="mt-3 text-[14px] font-medium text-emerald-700">✓ {done} uploaded</p> : null}
        {error ? (
          <p className="mt-3 text-[14px] text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!!uploading || !data}
          onClick={() => setView("pick")}
          className="driver-btn-ghost mt-4 flex h-14 w-full items-center justify-center text-[16px] font-semibold disabled:opacity-50"
        >
          + Add other document
        </button>
      </ActionSheet>

      <ActionSheet open={view === "pick"} title="What is it?" onClose={() => setView("list")}>
        <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto">
          {(data?.uploadTypes ?? []).map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => startUpload(t.slug)}
              className="rounded-2xl bg-[color:var(--canvas)] px-3 py-4 text-left text-[15px] font-medium text-[color:var(--ink)] active:scale-[0.98]"
            >
              {t.label}
            </button>
          ))}
        </div>
      </ActionSheet>
    </>
  );
}
