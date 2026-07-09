"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BarcodeCamera } from "@/components/barcode-camera";
import {
  countPhaseScanned,
  isPackageScannedForPhase,
  normalizeScanCode,
  type ScanPhase,
} from "@/lib/package-scan";
import { ScanPackage, verifyPackageScan } from "@/lib/driver-api";

type Props = {
  loadId: string;
  stopNumber: number;
  phase: ScanPhase;
  stopLabel: string;
  packages: ScanPackage[];
  onUpdated: () => void | Promise<void>;
  onSessionExpired?: () => void;
  /** Full-screen layout with back link to load detail */
  fullscreen?: boolean;
  loadDetailHref?: string;
  loadTitle?: string;
  onCompleteStop?: () => void | Promise<void>;
  completing?: boolean;
};

export function PackageScanPanel({
  loadId,
  stopNumber,
  phase,
  stopLabel,
  packages,
  onUpdated,
  onSessionExpired,
  fullscreen = false,
  loadDetailHref,
  loadTitle,
  onCompleteStop,
  completing = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [codeInput, setCodeInput] = useState("");
  const [cameraOn, setCameraOn] = useState(fullscreen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);

  const scannedCount = countPhaseScanned(packages, phase);
  const total = packages.length;
  const allScanned = total > 0 && scannedCount >= total;

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    if (!fullscreen) focusInput();
  }, [fullscreen, focusInput]);

  const submitCode = useCallback(
    async (raw: string) => {
      const code = normalizeScanCode(raw);
      if (!code || busy) return;

      const known = packages.some((p) => p.code.toUpperCase() === code);
      if (!known) {
        setError("Code not on this load");
        focusInput();
        return;
      }

      if (packages.some((p) => p.code.toUpperCase() === code && isPackageScannedForPhase(p, phase))) {
        setError("Already scanned at this stop");
        setCodeInput("");
        focusInput();
        return;
      }

      setBusy(true);
      setError(null);
      setLastOk(null);
      try {
        await verifyPackageScan(loadId, code, phase);
        setCodeInput("");
        setLastOk(code);
        await onUpdated();
        focusInput();
      } catch (e) {
        if (e instanceof Error && e.message === "SESSION_EXPIRED") {
          onSessionExpired?.();
          return;
        }
        setError(e instanceof Error ? e.message : "Scan failed");
        focusInput();
      } finally {
        setBusy(false);
      }
    },
    [busy, focusInput, loadId, onSessionExpired, onUpdated, packages, phase]
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitCode(codeInput);
  };

  const sorted = [...packages].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className={fullscreen ? "flex min-h-full flex-col" : "space-y-3"}>
      {fullscreen ? (
        <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            {loadDetailHref ? (
              <Link
                href={loadDetailHref}
                className="driver-btn-ghost flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </Link>
            ) : null}
            <div className="min-w-0 flex-1">
              {loadTitle ? (
                <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{loadTitle}</p>
              ) : null}
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)]">
                Scan · {stopLabel}
              </p>
              <p className="font-mono text-lg font-semibold text-[color:var(--accent)]">
                {scannedCount}/{total}
              </p>
            </div>
          </div>
        </header>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)]">
            Scan pieces · {stopLabel}
          </p>
          <span className="font-mono text-xs font-semibold text-[color:var(--accent)]">
            {scannedCount}/{total}
          </span>
        </div>
      )}

      <div className={fullscreen ? "mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-4" : "space-y-3"}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCameraOn((v) => !v)}
            className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold ${
              cameraOn
                ? "bg-[color:var(--accent)] text-white"
                : "border border-[color:var(--line)] bg-[color:var(--surface)]/60 text-[color:var(--ink)]"
            }`}
          >
            {cameraOn ? "Camera on" : "Use camera"}
          </button>
        </div>

        <BarcodeCamera active={cameraOn} onDetected={(code) => void submitCode(code)} />

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Scan or type code"
            disabled={busy || allScanned}
            className="h-11 min-w-0 flex-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--canvas)] px-3 font-mono text-sm outline-none focus:border-[color:var(--accent)] disabled:opacity-50"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            enterKeyHint="done"
          />
          <button
            type="submit"
            disabled={busy || allScanned || !codeInput.trim()}
            className="driver-btn-primary h-11 shrink-0 px-4 text-sm disabled:opacity-50"
          >
            {busy ? "…" : "Verify"}
          </button>
        </form>

        {lastOk ? (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Verified · {lastOk}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {allScanned && onCompleteStop ? (
          <button
            type="button"
            disabled={completing}
            onClick={() => void onCompleteStop()}
            className="driver-btn-primary flex h-12 w-full items-center justify-center text-sm font-semibold disabled:opacity-50"
          >
            {completing ? "Completing…" : `Complete ${stopLabel}`}
          </button>
        ) : allScanned ? (
          <p className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            All {total} pieces scanned.
          </p>
        ) : scannedCount > 0 ? (
          <p className="text-xs text-[color:var(--ink-muted)]">
            {total - scannedCount} remaining
          </p>
        ) : null}

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)]">
            Pieces
          </p>
          <ul
            className={`space-y-1 overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]/40 p-2 ${
              fullscreen ? "max-h-[min(40vh,320px)]" : "max-h-48 sm:max-h-64"
            }`}
          >
            {sorted.map((pkg) => {
              const done = isPackageScannedForPhase(pkg, phase);
              return (
                <li
                  key={pkg.code}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 font-mono text-xs ${
                    done
                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      : "text-[color:var(--ink-secondary)]"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : "border border-[color:var(--line)] text-[color:var(--ink-muted)]"
                    }`}
                    aria-hidden
                  >
                    {done ? "✓" : pkg.sequence}
                  </span>
                  <span className="min-w-0 truncate">{pkg.code}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
