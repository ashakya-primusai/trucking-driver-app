"use client";

import { FirebaseRealtimeProvider } from "@/lib/firebase-realtime";
import { LocationTrackingProvider } from "@/lib/location-tracking-context";
import type { ReactNode } from "react";

export function DriverAppProviders({ children }: { children: ReactNode }) {
  return (
    <FirebaseRealtimeProvider>
      <LocationTrackingProvider>{children}</LocationTrackingProvider>
    </FirebaseRealtimeProvider>
  );
}
