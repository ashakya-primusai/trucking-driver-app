"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { PackageScanPanel } from "@/components/package-scan-panel";
import { clearSession, getToken } from "@/lib/auth-storage";
import { AssignedLoad, fetchMyLoads, updateDriverLoadStop } from "@/lib/driver-api";
import { countPhaseScanned, scanPhaseForStopType } from "@/lib/package-scan";
import { useLocationTracking } from "@/lib/location-tracking-context";

export default function LoadScanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center p-8">
          <p className="text-sm text-[color:var(--ink-muted)]">Loading scanner…</p>
        </div>
      }
    >
      <LoadScanPageInner />
    </Suspense>
  );
}

function LoadScanPageInner() {
  const params = useParams<{ loadId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { stopTracking } = useLocationTracking();
  const loadId = params.loadId;
  const stopNumber = Math.max(1, parseInt(searchParams.get("stop") ?? "1", 10) || 1);

  const [load, setLoad] = useState<AssignedLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetchMyLoads();
    const found = res.data.loads.find((l) => l._id === loadId) ?? null;
    setLoad(found);
    if (!found) setError("Load not found or not assigned to you.");
    return found;
  }, [loadId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    refresh()
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && e.message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount fetch
  }, [loadId, refresh, router]);

  const stop = useMemo(() => {
    const stops = load?.stops ?? [];
    const byNum = stops.find((s) => s.stopNumber === stopNumber);
    if (byNum) return byNum;
    return stops[stopNumber - 1] ?? null;
  }, [load?.stops, stopNumber]);

  const phase = scanPhaseForStopType(stop?.type);
  const packages = load?.scanPackages ?? [];
  const loadHref = `/load/${loadId}`;
  const loadTitle =
    load?.loadNumber?.trim() || load?.referenceNumber?.trim() || loadId.slice(-8).toUpperCase();

  const handleSessionExpired = () => {
    stopTracking();
    clearSession();
    router.replace("/login");
  };

  const handleCompleteStop = async () => {
    if (!load || !stop) return;
    const scanned = countPhaseScanned(packages, phase);
    if (scanned < packages.length) {
      setActionError(`Scan all pieces first (${scanned}/${packages.length})`);
      return;
    }

    let signature: string | undefined;
    if (stop.type === "delivery") {
      const sig = window.prompt("Recipient name for delivery signature:");
      if (!sig?.trim()) {
        setActionError("Signature is required to complete delivery");
        return;
      }
      signature = sig.trim();
    }

    setCompleting(true);
    setActionError(null);
    try {
      await updateDriverLoadStop(loadId, stopNumber, {
        action: "completed",
        packagesCount: packages.length,
        signature,
      });
      router.push(loadHref);
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setActionError(e instanceof Error ? e.message : "Could not complete stop");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-8">
        <p className="text-sm text-[color:var(--ink-muted)]">Loading scanner…</p>
      </div>
    );
  }

  if (error || !load || !load.requiresScanning || packages.length === 0) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center p-6">
        <p className="text-sm text-[color:var(--danger)]">
          {error ?? "This load does not require package scanning."}
        </p>
        <Link href={loadHref} className="driver-btn-primary mt-4 flex h-11 items-center justify-center text-sm">
          Back to load
        </Link>
      </div>
    );
  }

  if (!stop || stop.stopStatus !== "arrived") {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center p-6">
        <p className="text-sm text-[color:var(--ink-secondary)]">
          Mark stop #{stopNumber} as <strong>Arrived</strong> on the load screen before scanning packages.
        </p>
        <Link href={loadHref} className="driver-btn-primary mt-4 flex h-11 items-center justify-center text-sm">
          Go to load
        </Link>
      </div>
    );
  }

  const stopLabel = (stop.type ?? "stop").replace(/_/g, " ");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[color:var(--canvas)]">
      <PackageScanPanel
        loadId={loadId}
        stopNumber={stopNumber}
        phase={phase}
        stopLabel={stopLabel}
        packages={packages}
        loadTitle={loadTitle}
        onUpdated={async () => {
          try {
            await refresh();
          } catch (e) {
            if (e instanceof Error && e.message === "SESSION_EXPIRED") {
              handleSessionExpired();
            }
          }
        }}
        onSessionExpired={handleSessionExpired}
        onCompleteStop={handleCompleteStop}
        completing={completing}
        fullscreen
        loadDetailHref={loadHref}
      />
      {actionError ? (
        <p className="mx-auto max-w-lg px-4 pb-6 text-center text-sm text-[color:var(--danger)]" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
