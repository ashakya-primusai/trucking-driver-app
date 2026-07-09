"use client";

import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, type User } from "firebase/auth";

import { fetchFirebaseToken } from "./driver-api";
import { getFirebaseApp } from "./firebase";
import {
  getStoredDriver,
  getToken,
  isFirebaseRealtimeAvailable,
  setFirebaseRealtimeAvailable,
} from "./auth-storage";

function auth() {
  return getAuth(getFirebaseApp());
}

function logFirebaseSignInError(err: unknown): void {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
  if (code === "auth/configuration-not-found") {
    console.warn(
      "[firebase] Authentication is not enabled for this Firebase project. " +
        "In Firebase Console → Build → Authentication → Get started (project: trucking-sds)."
    );
    return;
  }
  console.warn("[firebase] signInWithCustomToken failed:", err);
}

/** Sign in to Firebase using a custom token from the driver-app API. Never throws. */
export async function signInDriverFirebase(customToken: string | null | undefined): Promise<User | null> {
  if (!customToken) return null;
  try {
    const cred = await signInWithCustomToken(auth(), customToken);
    return cred.user;
  } catch (err) {
    logFirebaseSignInError(err);
    return null;
  }
}

/** Ensure Firebase Auth matches the current driver JWT (refresh token if needed). */
export async function ensureDriverFirebaseAuth(): Promise<User | null> {
  const jwt = getToken();
  const driver = getStoredDriver();
  if (!jwt || !driver) {
    await signOutDriverFirebase();
    return null;
  }

  const current = auth().currentUser;
  if (isFirebaseRealtimeAvailable() && current && String(current.uid) === String(driver.id)) {
    return current;
  }

  try {
    const res = await fetchFirebaseToken();
    const available = res.data?.firebaseRealtimeAvailable !== false;
    const token = res.data?.firebaseToken;

    if (!available) {
      setFirebaseRealtimeAvailable(false);
      console.warn(
        "[firebase] Live chat/notifications disabled — API server needs FIREBASE_DATABASE_URL and " +
          "FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_PATH) on trucking.primustechnologiesai.com"
      );
      return null;
    }

    setFirebaseRealtimeAvailable(true);

    if (!token) {
      console.warn(
        "[firebase] No custom token from API — check backend Firebase Admin credentials and /driver-app/auth/firebase-token"
      );
      return null;
    }
    return await signInDriverFirebase(token);
  } catch (err) {
    console.warn("[firebase] Driver auth failed:", err);
    return null;
  }
}

export async function signOutDriverFirebase(): Promise<void> {
  if (auth().currentUser) {
    await signOut(auth());
  }
}

export function subscribeFirebaseAuth(
  handler: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth(), handler);
}

export function getFirebaseAuthUser(): User | null {
  return auth().currentUser;
}
