// Imported only from client components, so no "use client" boundary here.
import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchLoadPlan, LoadPlan } from "@/lib/driver-api";
import { formatDuration, formatMiles } from "@/lib/load-stops";

const KM_TO_MI = 0.621371;

/** Three tiles — miles, drive time, fuel stops — linking to the full trip plan. Hidden until data arrives. */
export function TripStats({ loadId }: { loadId: string }) {
  const [plan, setPlan] = useState<LoadPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLoadPlan(loadId)
      .then((p) => !cancelled && setPlan(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadId]);

  const current = plan?.loadId === loadId ? plan : null;
  const miles =
    current?.route?.distanceMeters != null
      ? formatMiles(current.route.distanceMeters)
      : current?.fuel
        ? `${Math.round(current.fuel.totalDistanceKm * KM_TO_MI).toLocaleString()} mi`
        : null;
  const drive = current?.route?.durationSec != null ? formatDuration(current.route.durationSec) : null;
  const fuelStops = current?.fuel ? String(current.fuel.canCompleteWithoutRefueling ? 0 : current.fuel.stops.length) : null;

  if (!miles && !drive && !fuelStops) return null;

  return (
    <Link href={`/plan?load=${loadId}`} className="grid grid-cols-3 gap-2 no-underline">
      <Stat icon="🛣️" value={miles ?? "—"} label="Miles" />
      <Stat icon="⏱️" value={drive ?? "—"} label="Drive" />
      <Stat icon="⛽" value={fuelStops ?? "—"} label="Fuel stops" />
    </Link>
  );
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[color:var(--surface)] px-3 py-3 text-center">
      <p className="text-[18px] leading-none" aria-hidden>{icon}</p>
      <p className="mt-2 text-[17px] font-bold tabular-nums text-[color:var(--ink)]">{value}</p>
      <p className="text-[12px] text-[color:var(--ink-muted)]">{label}</p>
    </div>
  );
}
