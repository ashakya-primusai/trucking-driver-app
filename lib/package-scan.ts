import type { ScanPackage } from "./driver-api";

export type ScanPhase = "pickup" | "delivery";

export function scanPhaseForStopType(type: string | undefined): ScanPhase {
  return type === "delivery" ? "delivery" : "pickup";
}

export function isPackageScannedForPhase(pkg: ScanPackage, phase: ScanPhase): boolean {
  return phase === "pickup" ? Boolean(pkg.pickupScannedAt) : Boolean(pkg.deliveryScannedAt);
}

export function countPhaseScanned(packages: ScanPackage[], phase: ScanPhase): number {
  return packages.filter((p) => isPackageScannedForPhase(p, phase)).length;
}

export function normalizeScanCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function scanPageHref(loadId: string, stopNumber: number): string {
  return `/load/${encodeURIComponent(loadId)}/scan?stop=${stopNumber}`;
}
