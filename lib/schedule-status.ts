import type { LatenessStatus, MilestoneEta, ScheduleSummary } from "./driver-api";

const STATUS_RANK: Record<LatenessStatus, number> = {
  late: 3,
  at_risk: 2,
  on_time: 1,
  unknown: 0,
};

export function worstLatenessStatus(statuses: LatenessStatus[]): LatenessStatus {
  let worst: LatenessStatus = "unknown";
  for (const s of statuses) {
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

export function primaryLoadScheduleStatus(summary: ScheduleSummary | undefined): LatenessStatus {
  if (!summary) return "unknown";
  const statuses: LatenessStatus[] = [
    summary.pickup.status,
    ...(summary.delivery ? [summary.delivery.status] : []),
    ...summary.stops.map((s) => s.status),
    ...(summary.warehouse ? [summary.warehouse.status] : []),
  ];
  return worstLatenessStatus(statuses);
}

export function scheduleStatusLabel(status: LatenessStatus): string {
  switch (status) {
    case "on_time":
      return "On time";
    case "at_risk":
      return "At risk";
    case "late":
      return "Late";
    default:
      return "Unknown";
  }
}

export function scheduleStatusTone(
  status: LatenessStatus
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "on_time":
      return "success";
    case "at_risk":
      return "warning";
    case "late":
      return "danger";
    default:
      return "neutral";
  }
}

export function formatLatenessDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "";

  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  const mins = total % 60;

  if (days > 0) {
    if (hours > 0) return `~${days}d ${hours}h`;
    return `~${days}d`;
  }
  if (hours > 0) {
    if (mins > 0) return `~${hours}h ${mins}m`;
    return `~${hours}h`;
  }
  return `~${mins} min`;
}

export function formatMinutesLate(minutes: number): string {
  const duration = formatLatenessDuration(minutes);
  return duration ? `${duration} late` : "";
}

export function loadCardScheduleMessage(summary: ScheduleSummary | undefined): string {
  if (!summary) return "Schedule unavailable";
  if (summary.schedulePending) return "Updating schedule…";
  if (!summary.driverLocationAvailable) return "Enable location for ETA";

  const status = primaryLoadScheduleStatus(summary);
  const pickup = summary.pickup;

  if (status === "late" && pickup.minutesLate > 0) {
    return `Late for pickup · ${formatLatenessDuration(pickup.minutesLate)}`;
  }
  if (status === "at_risk") {
    return "Pickup at risk";
  }
  if (status === "on_time" && pickup.predictedDisplay) {
    return `Pickup on time · ETA ${pickup.predictedDisplay}`;
  }
  if (pickup.scheduledDisplay) {
    return `Scheduled ${pickup.scheduledDisplay}`;
  }
  return "Schedule unavailable";
}

export function findStopSchedule(
  summary: ScheduleSummary | undefined,
  stopNumber: number
): MilestoneEta | undefined {
  return summary?.stops.find((s) => s.stopNumber === stopNumber);
}
