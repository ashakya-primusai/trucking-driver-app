"use client";

import { useFirebaseRealtime } from "@/lib/firebase-realtime";

type Props = {
  className?: string;
};

/** Shown when the API server cannot issue Firebase custom tokens (live chat push off). */
export function FirebaseRealtimeBanner({ className }: Props) {
  const { connected, realtimeEnabled } = useFirebaseRealtime();

  if (realtimeEnabled && connected) return null;
  if (realtimeEnabled && !connected) {
    return (
      <p
        className={
          className ??
          "rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
        }
        role="status"
      >
        Connecting live updates… Chat still works; Bella replies may take a moment to appear.
      </p>
    );
  }

  return (
    <p
      className={
        className ??
        "rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
      }
      role="status"
    >
      Live chat push is off — the API server needs Firebase Admin configured (
      <code className="text-[10px]">FIREBASE_DATABASE_URL</code> + service account). You can
      still send messages; refresh to see Bella&apos;s replies.
    </p>
  );
}
