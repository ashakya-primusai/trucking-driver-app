import { getToken } from "./auth-storage";
import { normalizeLatLng } from "./coordinates";

const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://trucking.primustechnologiesai.com";

export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  status: number;
  message?: string;
};

export type ApiErrorBody = {
  success: false;
  data: null;
  error: { code: string; message: string; details?: unknown };
};

export type SendOtpResponse = { otp?: string };

export type VerifyOtpResponse = {
  token: string;
  firebaseToken?: string | null;
  /** False when API server lacks Firebase Admin credentials (chat push won't work). */
  firebaseRealtimeAvailable?: boolean;
  driver: {
    id: string;
    fullName?: string;
    phoneNumber?: string;
    tenantId: string;
  };
};

export type FirebaseTokenResponse = {
  firebaseToken: string | null;
  firebaseRealtimeAvailable?: boolean;
};

export type DriverLean = {
  _id: string;
  fullName?: string;
  phoneNumber?: string;
  availabilityStatus?: string;
  currentLocation?: unknown;
  vehicle?: unknown;
};

export type ScanPackage = {
  code: string;
  sequence: number;
  pickupScannedAt?: string | null;
  deliveryScannedAt?: string | null;
};

export type LoadStop = {
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  date?: string;
  time?: string;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  stopNumber?: number;
  stopStatus?: string;
  isCurrentStop?: boolean;
  packagesCount?: number;
  coordinates?: [number, number] | null;
  coordinatesAvailable?: boolean | null;
};

export type VerifyPackageScanResponse = {
  valid: boolean;
  code: string;
  sequence: number;
  phase: "pickup" | "delivery";
  scanned: number;
  total: number;
  allScanned: boolean;
};

export type UpdateLoadStopAction = "en_route" | "arrived" | "completed" | "skipped" | "failed";

export type UpdateLoadStopBody = {
  action: UpdateLoadStopAction;
  packagesCount?: number;
  temperatureReading?: number;
  signature?: string;
  notes?: string;
};

export type UpdateLoadStopResponse = {
  loadId: string;
  updatedStop: {
    stopNumber: number;
    stopStatus: string;
    locationName: string;
    actualArrival: string | null;
    actualDeparture: string | null;
    isOnTime: boolean | null;
    delayMinutes: number;
    packagesCount: number;
    temperatureReading: number | null;
    temperatureOk: boolean | null;
  };
  loadStatus: {
    lifecycleCheckpoint: string | null;
    currentStopIndex: number;
    currentStopLocation: string | null;
    nextStopLocation: string | null;
    completedStops: number;
    totalStops: number;
  };
};

export type UpdateDriverLocationResponse = {
  driverId: string;
  currentLocation?: { type?: string; coordinates?: number[] };
  locationUpdatedAt?: string | null;
  lastSpeedKmh?: number | null;
};

export type LatenessStatus = "on_time" | "at_risk" | "late" | "unknown";

export type MilestoneEta = {
  scheduledAt: string | null;
  scheduledDisplay: string | null;
  predictedArrivalAt: string | null;
  predictedDisplay: string | null;
  status: LatenessStatus;
  minutesLate: number;
};

export type StopScheduleEta = MilestoneEta & {
  stopNumber: number;
  type: string;
};

export type WarehouseScheduleEta = {
  requiredArrivalAt: string | null;
  requiredArrivalDisplay: string | null;
  predictedArrivalAt: string | null;
  predictedDisplay: string | null;
  status: LatenessStatus;
  minutesLate: number;
};

export type ScheduleSummary = {
  routingAvailable: boolean;
  routingSource: "routed" | "estimated" | "none";
  driverLocationAvailable: boolean;
  warehouseInChain: boolean;
  /** True while background routing is computing a baseline */
  schedulePending?: boolean;
  pickup: MilestoneEta;
  delivery: MilestoneEta | null;
  warehouse: WarehouseScheduleEta | null;
  stops: StopScheduleEta[];
};

export type AssignedLoad = {
  _id: string;
  loadNumber?: string;
  referenceNumber?: string;
  customerName?: string;
  brokerPartner?: string;
  lifecycleCheckpoint?: string | null;
  pickupLocation?: string;
  destination?: string;
  loadDescription?: string;
  commodityType?: string;
  specialInstructions?: string;
  assignedAt?: string;
  requiresScanning?: boolean;
  scanPackages?: ScanPackage[];
  stops?: LoadStop[];
  currentStopIndex?: number;
  currentStopLocation?: string | null;
  nextStopLocation?: string | null;
  scheduleSummary?: ScheduleSummary;
};

export type WarehouseDistance = {
  locationLabel: string | null;
  distanceKm: number | null;
  distanceDisplay: string | null;
  coordinatesAvailable: boolean;
  driverLocationAvailable: boolean;
};

export type MyLoadsResponse = {
  driver: DriverLean;
  loads: AssignedLoad[];
  warehouse?: WarehouseDistance;
};

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function driverAppPath(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}/driver-app${p}`;
}

export async function sendDriverOtp(phoneNumber: string) {
  const res = await fetch(driverAppPath("/auth/send-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  const body = (await parseJson(res)) as ApiSuccess<SendOtpResponse> | ApiErrorBody | null;
  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg =
      body && (body as ApiErrorBody).success === false
        ? (body as ApiErrorBody).error.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<SendOtpResponse>;
}

export async function verifyDriverOtp(phoneNumber: string, otp: string) {
  const res = await fetch(driverAppPath("/auth/verify-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, otp }),
  });
  const body = (await parseJson(res)) as ApiSuccess<VerifyOtpResponse> | ApiErrorBody | null;
  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg =
      body && (body as ApiErrorBody).success === false
        ? (body as ApiErrorBody).error.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<VerifyOtpResponse>;
}

export async function fetchFirebaseToken() {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath("/auth/firebase-token"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const body = (await parseJson(res)) as ApiSuccess<FirebaseTokenResponse> | ApiErrorBody | null;

  if (res.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg =
      body && (body as ApiErrorBody).success === false
        ? (body as ApiErrorBody).error.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<FirebaseTokenResponse>;
}

export async function fetchMyLoads() {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath("/me/loads"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const body = (await parseJson(res)) as
    | ApiSuccess<MyLoadsResponse>
    | ApiErrorBody
    | { message?: string }
    | null;

  if (res.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const plain = body as { message?: string } | null;
    const msg =
      body && (body as ApiErrorBody).success === false
        ? (body as ApiErrorBody).error.message
        : plain?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<MyLoadsResponse>;
}

export async function updateDriverLoadStop(
  loadId: string,
  stopNumber: number,
  body: UpdateLoadStopBody
) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const path = `/loads/${encodeURIComponent(loadId)}/stops/${stopNumber}`;
  const res = await fetch(driverAppPath(path), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = (await parseJson(res)) as
    | ApiSuccess<UpdateLoadStopResponse>
    | ApiErrorBody
    | { message?: string }
    | null;

  if (res.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok || !parsed || (parsed as ApiErrorBody).success === false) {
    const plain = parsed as { message?: string } | null;
    const msg =
      parsed && (parsed as ApiErrorBody).success === false
        ? (parsed as ApiErrorBody).error.message
        : plain?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as ApiSuccess<UpdateLoadStopResponse>;
}

export async function verifyPackageScan(
  loadId: string,
  code: string,
  phase: "pickup" | "delivery"
) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const path = `/loads/${encodeURIComponent(loadId)}/scan`;
  const res = await fetch(driverAppPath(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: code.trim(), phase }),
  });
  const parsed = (await parseJson(res)) as
    | ApiSuccess<VerifyPackageScanResponse>
    | ApiErrorBody
    | { message?: string }
    | null;

  if (res.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok || !parsed || (parsed as ApiErrorBody).success === false) {
    const plain = parsed as { message?: string } | null;
    const msg =
      parsed && (parsed as ApiErrorBody).success === false
        ? (parsed as ApiErrorBody).error.message
        : plain?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as ApiSuccess<VerifyPackageScanResponse>;
}

// ─── Chat / Bella ──────────────────────────────────────────────────────

export type ChatMessage = {
  _id: string;
  role: "driver" | "bella" | "dispatch";
  content: string;
  escalatedToNotification: string | null;
  stuckReported?: boolean;
  createdAt: string;
};

export type SendChatResponse = {
  reply: string;
  escalated: boolean;
  notificationId: string | null;
  stuckReported?: boolean;
};

export type ChatHistoryResponse = {
  messages: ChatMessage[];
};

export async function sendChatMessage(message: string) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath("/chat/send"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  const body = (await parseJson(res)) as
    | ApiSuccess<SendChatResponse>
    | ApiErrorBody
    | null;

  if (res.status === 401) throw new Error("SESSION_EXPIRED");

  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg =
      body && (body as ApiErrorBody).success === false
        ? (body as ApiErrorBody).error.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<SendChatResponse>;
}

export async function fetchChatHistory(limit = 50, before?: string) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);

  const res = await fetch(driverAppPath(`/chat/history?${params}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const body = (await parseJson(res)) as
    | ApiSuccess<ChatHistoryResponse>
    | ApiErrorBody
    | null;

  if (res.status === 401) throw new Error("SESSION_EXPIRED");

  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg =
      body && (body as ApiErrorBody).success === false
        ? (body as ApiErrorBody).error.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<ChatHistoryResponse>;
}

// ─── Driver Notifications ─────────────────────────────────────────────

export type DriverNotification = {
  _id: string;
  type: "load_assigned" | "load_updated" | "message" | "system";
  title: string;
  body: string;
  load: string | null;
  read: boolean;
  createdAt: string;
};

export type DriverNotificationsResponse = {
  notifications: DriverNotification[];
  total: number;
  unreadCount: number;
};

export type DriverUnreadCountResponse = {
  count: number;
};

export function normalizeDriverNotification(raw: unknown): DriverNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const type = n.type;
  if (
    type !== "load_assigned" &&
    type !== "load_updated" &&
    type !== "message" &&
    type !== "system"
  ) {
    return null;
  }
  const id = n._id != null ? String(n._id) : "";
  if (!id) return null;
  const createdAt =
    n.createdAt instanceof Date
      ? n.createdAt.toISOString()
      : typeof n.createdAt === "string"
        ? n.createdAt
        : new Date().toISOString();
  return {
    _id: id,
    type,
    title: String(n.title ?? ""),
    body: String(n.body ?? ""),
    load: n.load != null && String(n.load).length > 0 ? String(n.load) : null,
    read: Boolean(n.read),
    createdAt,
  };
}

export async function fetchDriverNotifications(limit = 50, skip = 0) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  const res = await fetch(driverAppPath(`/notifications?${params}`), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = (await parseJson(res)) as ApiSuccess<DriverNotificationsResponse> | ApiErrorBody | null;
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg = body && (body as ApiErrorBody).success === false
      ? (body as ApiErrorBody).error.message
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const success = body as ApiSuccess<DriverNotificationsResponse>;
  const notifications = (success.data.notifications ?? [])
    .map(normalizeDriverNotification)
    .filter((n): n is DriverNotification => n != null);
  return {
    ...success,
    data: {
      ...success.data,
      notifications,
    },
  };
}

export async function fetchDriverUnreadCount() {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath("/notifications/unread-count"), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = (await parseJson(res)) as ApiSuccess<DriverUnreadCountResponse> | ApiErrorBody | null;
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg = body && (body as ApiErrorBody).success === false
      ? (body as ApiErrorBody).error.message
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<DriverUnreadCountResponse>;
}

export async function markDriverNotificationRead(notificationId: string) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath(`/notifications/${encodeURIComponent(notificationId)}/read`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = (await parseJson(res)) as ApiSuccess<DriverNotification> | ApiErrorBody | null;
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg = body && (body as ApiErrorBody).success === false
      ? (body as ApiErrorBody).error.message
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<DriverNotification>;
}

export async function markAllDriverNotificationsRead() {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath("/notifications/mark-all-read"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = (await parseJson(res)) as ApiSuccess<{ modifiedCount: number }> | ApiErrorBody | null;
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    const msg = body && (body as ApiErrorBody).success === false
      ? (body as ApiErrorBody).error.message
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as ApiSuccess<{ modifiedCount: number }>;
}

export type NavRouteResult = {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  durationSec: number;
  distanceMeters: number;
  provider: "tomtom" | "mapbox";
};

export async function fetchNavRoute(
  originLng: number, originLat: number,
  destLng: number, destLat: number
): Promise<NavRouteResult | null> {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath("/nav-route"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ originLng, originLat, destLng, destLat }),
  });
  const body = (await parseJson(res)) as ApiSuccess<NavRouteResult> | ApiErrorBody | null;
  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (!res.ok || !body || (body as ApiErrorBody).success === false) return null;
  return (body as ApiSuccess<NavRouteResult>).data;
}

export type LoadRouteGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type LoadRouteData = {
  _id: string;
  load: string;
  status: "pending" | "ready" | "failed" | "skipped";
  routes: Array<{
    primary: boolean;
    geometry: LoadRouteGeometry;
    distanceMeters: number;
    durationSec: number;
  }>;
} | null;

export async function fetchLoadRoute(loadId: string): Promise<LoadRouteData> {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath(`/loads/${encodeURIComponent(loadId)}/route`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const body = (await parseJson(res)) as ApiSuccess<LoadRouteData> | ApiErrorBody | null;

  if (res.status === 401) throw new Error("SESSION_EXPIRED");
  if (res.status === 404) return null;

  if (!res.ok || !body || (body as ApiErrorBody).success === false) {
    return null;
  }
  return (body as ApiSuccess<LoadRouteData>).data;
}

/** POST /driver-app/loads/:loadId/schedule/refresh — force recompute ETAs from current location. */
export async function refreshLoadSchedule(loadId: string): Promise<ScheduleSummary> {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(driverAppPath(`/loads/${encodeURIComponent(loadId)}/schedule/refresh`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const parsed = (await parseJson(res)) as
    | ApiSuccess<{ scheduleSummary: ScheduleSummary }>
    | ApiErrorBody
    | { message?: string }
    | null;

  if (res.status === 401) throw new Error("SESSION_EXPIRED");

  if (!res.ok || !parsed || (parsed as ApiErrorBody).success === false) {
    const plain = parsed as { message?: string } | null;
    const msg =
      parsed && (parsed as ApiErrorBody).success === false
        ? (parsed as ApiErrorBody).error.message
        : plain?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return (parsed as ApiSuccess<{ scheduleSummary: ScheduleSummary }>).data.scheduleSummary;
}

/** PATCH /driver-app/me/location — GeoJSON Point [lng, lat] on the Driver document. */
export async function updateDriverLocation(lng: number, lat: number, speedKmh?: number) {
  const token = getToken();
  if (!token) throw new Error("Not signed in");

  const { lat: validLat, lng: validLng } = normalizeLatLng(lat, lng);
  const body: { lng: number; lat: number; speedKmh?: number } = { lng: validLng, lat: validLat };
  if (speedKmh != null && Number.isFinite(speedKmh) && speedKmh >= 0) {
    body.speedKmh = Math.round(speedKmh * 10) / 10;
  }

  const res = await fetch(driverAppPath("/me/location"), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = (await parseJson(res)) as
    | ApiSuccess<UpdateDriverLocationResponse>
    | ApiErrorBody
    | { message?: string }
    | null;

  if (res.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok || !parsed || (parsed as ApiErrorBody).success === false) {
    const plain = parsed as { message?: string } | null;
    const msg =
      parsed && (parsed as ApiErrorBody).success === false
        ? (parsed as ApiErrorBody).error.message
        : plain?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as ApiSuccess<UpdateDriverLocationResponse>;
}
