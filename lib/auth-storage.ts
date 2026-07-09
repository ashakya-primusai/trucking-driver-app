const TOKEN_KEY = "driver_app_token";
const DRIVER_KEY = "driver_app_profile";
const FIREBASE_RT_KEY = "driver_app_firebase_rt";

export type StoredDriver = {
  id: string;
  fullName?: string;
  phoneNumber?: string;
  tenantId: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(
  token: string,
  driver: StoredDriver,
  options?: { firebaseRealtimeAvailable?: boolean }
) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
  if (options?.firebaseRealtimeAvailable !== undefined) {
    localStorage.setItem(
      FIREBASE_RT_KEY,
      options.firebaseRealtimeAvailable ? "1" : "0"
    );
  }
}

export function isFirebaseRealtimeAvailable(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(FIREBASE_RT_KEY);
  if (v === "0") return false;
  if (v === "1") return true;
  return true;
}

export function setFirebaseRealtimeAvailable(available: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FIREBASE_RT_KEY, available ? "1" : "0");
}

export function getStoredDriver(): StoredDriver | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DRIVER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDriver;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(DRIVER_KEY);
  localStorage.removeItem(FIREBASE_RT_KEY);
}
