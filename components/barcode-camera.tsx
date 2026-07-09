"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
  onDetected: (code: string) => void;
  className?: string;
};

export function BarcodeCamera({ active, onDetected, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  onDetectedRef.current = onDetected;

  const handleResult = useCallback((text: string) => {
    const code = text.trim();
    if (!code) return;
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last && last.code === code && now - last.at < 2500) return;
    lastCodeRef.current = { code, at: now };
    onDetectedRef.current(code);
  }, []);

  useEffect(() => {
    if (!active) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraError(null);
      setStarting(false);
      return;
    }

    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    setStarting(true);
    setCameraError(null);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              handleResult(result.getText());
            }
            if (err && !(err as { name?: string }).name?.includes("NotFound")) {
              // NotFoundException is normal while searching
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        if (cancelled) return;
        setStarting(false);
        setCameraError(
          e instanceof Error ? e.message : "Could not access camera. Use manual entry below."
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, handleResult]);

  if (!active) return null;

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--line)] bg-black aspect-[4/3]">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />
        <div
          className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          aria-hidden
        />
        {starting ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            Starting camera…
          </div>
        ) : null}
      </div>
      {cameraError ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">{cameraError}</p>
      ) : (
        <p className="mt-2 text-xs text-[color:var(--ink-muted)]">
          Point camera at barcode. Codes are verified automatically.
        </p>
      )}
    </div>
  );
}

