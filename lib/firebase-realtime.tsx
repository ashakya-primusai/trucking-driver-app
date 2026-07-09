"use client";

/**
 * Firebase Realtime Database listeners for driver chat and notifications.
 *
 * Backend writes:
 *   drivers/{driverId}/chat/messages/{messageId}
 *   drivers/{driverId}/notifications/{notificationId}
 */

import { getDatabase, onChildAdded, ref, type Unsubscribe } from "firebase/database";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ensureDriverFirebaseAuth, signOutDriverFirebase, subscribeFirebaseAuth } from "./firebase-auth";
import { getFirebaseApp } from "./firebase";
import { getStoredDriver, getToken, isFirebaseRealtimeAvailable } from "./auth-storage";

export interface FirebaseDriverChatEvent {
  driverId: string;
  driverName: string;
  message: {
    _id: string;
    role: "driver" | "bella" | "dispatch";
    content: string;
    createdAt: string | Date;
  };
  pushedAt?: number;
}

export interface FirebaseDriverNotificationEvent {
  _id: string;
  type: string;
  title: string;
  body: string;
  load: string | null;
  read: boolean;
  createdAt: string | Date;
  pushedAt?: number;
}

type Listener = (data: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

function emit(event: string, data: unknown) {
  const bucket = listeners.get(event);
  if (!bucket) return;
  for (const fn of bucket) fn(data);
}

function subscribe(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

interface FirebaseRealtimeContextValue {
  connected: boolean;
  realtimeEnabled: boolean;
}

const FirebaseRealtimeContext = createContext<FirebaseRealtimeContextValue>({
  connected: false,
  realtimeEnabled: true,
});

function driverPaths(driverId: string) {
  return {
    chat: `drivers/${driverId}/chat/messages`,
    notifications: `drivers/${driverId}/notifications`,
  };
}

function emitChatMessage(val: FirebaseDriverChatEvent | null) {
  if (!val?.message) return;
  emit("driver_chat:message", {
    ...val,
    message: {
      ...val.message,
      _id: String(val.message._id),
    },
  });
}

let attachGeneration = 0;
let attachDriverListeners: ((driverId: string, force?: boolean) => Promise<void>) | null = null;
let subscribedDriverId: string | null = null;
let activeUnsubs: Unsubscribe[] = [];

/**
 * Ensure RTDB listeners are active (e.g. when opening chat).
 */
export function ensureDriverRealtimeAttached(driverId?: string): void {
  const id = driverId ?? getStoredDriver()?.id;
  if (!id || !attachDriverListeners) return;
  const force = subscribedDriverId !== String(id) || activeUnsubs.length === 0;
  void attachDriverListeners(id, force);
}

export function FirebaseRealtimeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRealtimeEnabled(isFirebaseRealtimeAvailable());

    function clearDbListeners() {
      for (const unsub of activeUnsubs) unsub();
      activeUnsubs = [];
      subscribedDriverId = null;
      setConnected(false);
    }

    async function attachDbListeners(driverId: string, force = false) {
      if (!isFirebaseRealtimeAvailable()) {
        clearDbListeners();
        return;
      }

      const normalizedId = String(driverId);
      if (!force && subscribedDriverId === normalizedId && activeUnsubs.length > 0) {
        return;
      }

      const gen = ++attachGeneration;
      clearDbListeners();

      const user = await ensureDriverFirebaseAuth();
      if (cancelled || gen !== attachGeneration) return;

      const driver = getStoredDriver();
      const driverIdFromStore = driver ? String(driver.id) : "";
      if (!user || !driver || String(user.uid) !== driverIdFromStore) {
        if (
          isFirebaseRealtimeAvailable() &&
          driver &&
          user &&
          String(user.uid) !== driverIdFromStore
        ) {
          console.warn("[firebase] auth uid mismatch", {
            authUid: user.uid,
            driverId: driverIdFromStore,
          });
        }
        return;
      }

      if (normalizedId !== driverIdFromStore) {
        console.warn("[firebase] listener driverId does not match session", {
          requested: normalizedId,
          session: driverIdFromStore,
        });
        return;
      }

      const db = getDatabase(getFirebaseApp());
      const paths = driverPaths(normalizedId);
      const chatRef = ref(db, paths.chat);
      const notifRef = ref(db, paths.notifications);
      const attachMs = Date.now();
      const unsubs: Unsubscribe[] = [];

      // onChildAdded replays existing rows then streams new ones; chat UI dedupes by _id.
      unsubs.push(
        onChildAdded(chatRef, (snap) => {
          emitChatMessage(snap.val() as FirebaseDriverChatEvent | null);
        })
      );

      const isNewNotif = (pushedAt?: number) =>
        pushedAt == null || pushedAt >= attachMs - 10_000;

      unsubs.push(
        onChildAdded(notifRef, (snap) => {
          const val = snap.val() as FirebaseDriverNotificationEvent | null;
          if (!val?._id || !isNewNotif(val.pushedAt)) return;
          emit("driver_notification:new", val);
        })
      );

      if (cancelled || gen !== attachGeneration) {
        for (const unsub of unsubs) unsub();
        return;
      }

      activeUnsubs = unsubs;
      subscribedDriverId = normalizedId;
      setConnected(true);
    }

    attachDriverListeners = attachDbListeners;

    const unsubAuth = subscribeFirebaseAuth((user) => {
      if (cancelled) return;
      const jwt = getToken();
      const driver = getStoredDriver();
      if (!jwt || !driver) {
        clearDbListeners();
        return;
      }

      const driverId = String(driver.id);

      if (!user || String(user.uid) !== driverId) {
        clearDbListeners();
        void ensureDriverFirebaseAuth().then((signedIn) => {
          if (!cancelled && signedIn && String(signedIn.uid) === driverId) {
            void attachDbListeners(driverId, true);
          }
        });
        return;
      }

      void attachDbListeners(driverId);
    });

    if (getToken() && getStoredDriver()) {
      setRealtimeEnabled(isFirebaseRealtimeAvailable());
      if (isFirebaseRealtimeAvailable()) {
        void ensureDriverFirebaseAuth().then(() => {
          if (!cancelled) setRealtimeEnabled(isFirebaseRealtimeAvailable());
        });
      }
    } else {
      void signOutDriverFirebase();
    }

    return () => {
      cancelled = true;
      unsubAuth();
      clearDbListeners();
      attachDriverListeners = null;
    };
  }, []);

  return (
    <FirebaseRealtimeContext.Provider value={{ connected, realtimeEnabled }}>
      {children}
    </FirebaseRealtimeContext.Provider>
  );
}

export function useFirebaseRealtime(): FirebaseRealtimeContextValue {
  return useContext(FirebaseRealtimeContext);
}

export function useFirebaseEvent<T = unknown>(
  event: string,
  handler: (data: T) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe(event, (data) => handlerRef.current(data as T));
  }, [event]);
}
