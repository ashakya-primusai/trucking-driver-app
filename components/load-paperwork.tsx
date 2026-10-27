// Imported only from client components, so no "use client" boundary here.
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchLoadDocuments, LoadDocumentsResponse, uploadLoadDocument } from "@/lib/driver-api";
import { prepareFileForUpload } from "@/lib/file-upload";
import { ActionSheet } from "@/components/action-sheet";

/** Paperwork for one load: what's still needed, one-tap photo upload, and what's on file. */
export function LoadPaperwork({
  loadId,
  onSessionExpired,
}: {
  loadId: string;
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState<LoadDocumentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
      .catch((e) => !cancelled && handleError(e, "Could not load paperwork"));
    return () => {
      cancelled = true;
    };
  }, [loadId, handleError]);

  const startUpload = (slug: string) => {
    pendingType.current = slug;
    setPickerOpen(false);
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
  const uploadingLabel = uploading ? data?.uploadTypes.find((t) => t.slug === uploading)?.label : null;

  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold text-[color:var(--ink)]">Paperwork</h2>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {needed.length > 0 ? (
        <div className="mb-3 flex flex-col gap-2">
          {needed.map((item) => (
            <button
              key={`${item.stage}-${item.slug}`}
              type="button"
              disabled={!!uploading}
              onClick={() => startUpload(item.slug)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-[color:var(--warning-soft)] px-4 py-3 text-left disabled:opacity-50"
            >
              <span>
                <span className="block text-[15px] font-semibold text-[color:var(--ink)]">{item.label}</span>
                <span className="block text-[13px] text-amber-900">
                  {item.enforcement === "block" ? "Required" : "Needed"}
                </span>
              </span>
              <CameraIcon />
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        disabled={!!uploading || !data}
        onClick={() => setPickerOpen(true)}
        className="driver-btn-ghost flex h-12 w-full items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-50"
      >
        {uploading ? `Uploading ${uploadingLabel ?? ""}…` : "+ Add document"}
      </button>

      {done ? (
        <p className="mt-2 text-[14px] font-medium text-emerald-700">✓ {done} uploaded</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[14px] text-[color:var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {data && data.documents.length > 0 ? (
        <ul className="mt-3 divide-y divide-[color:var(--line)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)]">
          {data.documents.map((d) => (
            <li key={d._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-[color:var(--ink)]">{d.label}</span>
                {d.rejected ? (
                  <span className="block text-[12px] text-[color:var(--danger)]">
                    Rejected{d.rejectedReason ? ` · ${d.rejectedReason}` : ""} — please re-upload
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[12px] text-[color:var(--ink-muted)]">
                {d.approved ? "Approved" : d.rejected ? "" : "On file"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <ActionSheet open={pickerOpen} title="What are you uploading?" onClose={() => setPickerOpen(false)}>
        <div className="grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto">
          {(data?.uploadTypes ?? []).map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => startUpload(t.slug)}
              className="rounded-2xl border border-[color:var(--line)] px-4 py-3.5 text-left text-[15px] font-medium text-[color:var(--ink)] active:bg-[color:var(--canvas-muted)]"
            >
              {t.label}
            </button>
          ))}
        </div>
      </ActionSheet>
    </section>
  );
}

function CameraIcon() {
  return (
    <svg className="h-6 w-6 shrink-0 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}
