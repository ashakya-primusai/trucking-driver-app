// Imported only from client components, so no "use client" boundary here.
import { useEffect } from "react";

/** Simple modal sheet that slides up from the bottom. Tap the backdrop or Cancel to close. */
export function ActionSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-[color:var(--surface)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[var(--shadow-floating)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--line-strong)]" aria-hidden />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-[color:var(--ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-medium text-[color:var(--ink-muted)]"
          >
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
