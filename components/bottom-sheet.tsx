"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SheetSnap = "collapsed" | "expanded";

type Props = {
  children: React.ReactNode;
  initial?: SheetSnap;
  /** Height in pixels for the collapsed (peek) snap point. */
  collapsedHeight?: number;
  /** Height fraction (0–1) of the viewport for the expanded snap point. */
  expandedFraction?: number;
  onSnapChange?: (snap: SheetSnap) => void;
  className?: string;
};

export function BottomSheet({
  children,
  initial = "collapsed",
  collapsedHeight = 168,
  expandedFraction = 0.85,
  onSnapChange,
  className,
}: Props) {
  const [snap, setSnap] = useState<SheetSnap>(initial);
  const [viewportH, setViewportH] = useState(800);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewportH(window.innerHeight);
    function onResize() {
      setViewportH(window.innerHeight);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const expandedH = Math.round(viewportH * expandedFraction);
  const targetH = snap === "expanded" ? expandedH : collapsedHeight;

  const setSnapWithCb = useCallback(
    (s: SheetSnap) => {
      setSnap((prev) => {
        if (prev !== s) onSnapChange?.(s);
        return s;
      });
    },
    [onSnapChange]
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    dragDelta.current = 0;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY.current == null) return;
    dragDelta.current = e.clientY - dragStartY.current;
    if (!sheetRef.current) return;
    const nextH = clamp(targetH - dragDelta.current, collapsedHeight - 40, expandedH + 40);
    sheetRef.current.style.height = `${nextH}px`;
    sheetRef.current.style.transition = "none";
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY.current == null) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    const delta = dragDelta.current;
    dragStartY.current = null;
    dragDelta.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "";
    if (delta < -40) {
      setSnapWithCb("expanded");
    } else if (delta > 40) {
      setSnapWithCb("collapsed");
    } else {
      if (sheetRef.current) sheetRef.current.style.height = "";
    }
  }

  const toggleSnap = () =>
    setSnapWithCb(snap === "expanded" ? "collapsed" : "expanded");

  return (
    <div
      ref={sheetRef}
      className={`sheet-root ${className ?? ""}`}
      style={{ height: targetH }}
      role="dialog"
      aria-label="Load details"
    >
      <div
        className="sheet-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={toggleSnap}
        aria-label={snap === "expanded" ? "Collapse details" : "Expand details"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSnap();
          }
        }}
      />
      <div className="sheet-body">{children}</div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
