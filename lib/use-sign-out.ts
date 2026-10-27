import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { clearSession } from "./auth-storage";
import { signOutDriverFirebase } from "./firebase-auth";
import { useLocationTracking } from "./location-tracking-context";

/** Stop tracking, clear the session and go to login — used on logout and on SESSION_EXPIRED. */
export function useSignOut() {
  const router = useRouter();
  const { stopTracking } = useLocationTracking();
  return useCallback(() => {
    stopTracking();
    clearSession();
    void signOutDriverFirebase();
    router.replace("/login");
  }, [router, stopTracking]);
}
