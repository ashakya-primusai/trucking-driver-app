"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { clearSession, getToken } from "@/lib/auth-storage";
import { signOutDriverFirebase } from "@/lib/firebase-auth";
import {
  DriverNotification,
  fetchDriverNotifications,
  markDriverNotificationRead,
  markAllDriverNotificationsRead,
  normalizeDriverNotification,
} from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { useFirebaseEvent, type FirebaseDriverNotificationEvent } from "@/lib/firebase-realtime";
import { BottomTabNav } from "@/components/bottom-tab-nav";

const TYPE_ICONS: Record<string, { emoji: string; bg: string }> = {
  load_assigned: { emoji: "🚛", bg: "bg-orange-100 dark:bg-orange-900/30" },
  load_updated: { emoji: "📦", bg: "bg-blue-100 dark:bg-blue-900/30" },
  message: { emoji: "💬", bg: "bg-teal-100 dark:bg-teal-900/30" },
  system: { emoji: "⚙️", bg: "bg-slate-100 dark:bg-slate-800" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const { stopTracking } = useLocationTracking();
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    stopTracking();
    clearSession();
    void signOutDriverFirebase();
    router.replace("/login");
  }, [router, stopTracking]);

  const loadNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const res = await fetchDriverNotifications(50);
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void loadNotifications();
  }, [router, loadNotifications]);

  useEffect(() => {
    const refresh = () => {
      if (!getToken()) return;
      void loadNotifications({ silent: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadNotifications]);

  useFirebaseEvent<FirebaseDriverNotificationEvent>(
    "driver_notification:new",
    useCallback((evt) => {
      const n = normalizeDriverNotification(evt);
      if (!n) {
        void loadNotifications({ silent: true });
        return;
      }
      setNotifications((prev) => {
        if (prev.some((p) => p._id === n._id)) return prev;
        return [n, ...prev];
      });
      if (!n.read) setUnreadCount((c) => c + 1);
    }, [loadNotifications])
  );

  const handleMarkRead = async (id: string) => {
    try {
      await markDriverNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllDriverNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
      }
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="app-shell flex min-h-full flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--ink-muted)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
            >
              <BackIcon />
            </button>
            <div>
              <h1 className="text-[15px] font-semibold text-[color:var(--ink)]">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <p className="text-[11px] text-[color:var(--ink-muted)]">
                  {unreadCount} unread
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadNotifications({ silent: true })}
              disabled={refreshing}
              className="driver-btn-ghost flex h-9 w-9 items-center justify-center disabled:opacity-40"
              aria-label="Refresh notifications"
            >
              <RefreshIcon className={refreshing ? "animate-spin" : ""} />
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)] transition hover:bg-[color:var(--accent-soft)]"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-4 sm:px-5">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="driver-card h-20 animate-pulse bg-[color:var(--surface)]/50"
                aria-hidden
              />
            ))}
            <p className="text-center text-sm text-[color:var(--ink-muted)]">
              Loading notifications…
            </p>
          </div>
        ) : error ? (
          <div
            className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
            style={{
              borderColor: "var(--line)",
              background: "var(--danger-soft)",
              color: "var(--danger)",
            }}
            role="alert"
          >
            {error}
          </div>
        ) : notifications.length === 0 ? (
          <div className="driver-card flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--track-soft)] text-teal-700 dark:text-teal-300">
              <BellIcon />
            </div>
            <p className="text-lg font-semibold text-[color:var(--ink)]">
              All caught up
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[color:var(--ink-muted)]">
              When you get assigned a load or receive updates, notifications
              will appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => {
              const icon = TYPE_ICONS[n.type] ?? TYPE_ICONS.system;
              return (
                <li key={n._id}>
                  <NotificationCard
                    notification={n}
                    icon={icon}
                    formatTime={formatTime}
                    onMarkRead={handleMarkRead}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <BottomTabNav />
    </div>
  );
}

function NotificationCard({
  notification: n,
  icon,
  formatTime,
  onMarkRead,
}: {
  notification: DriverNotification;
  icon: { emoji: string; bg: string };
  formatTime: (d: string) => string;
  onMarkRead: (id: string) => void;
}) {
  const inner = (
    <div
      className={`driver-card flex items-start gap-3 p-4 transition ${
        !n.read
          ? "border-l-[3px] border-l-[color:var(--accent)]"
          : "opacity-75"
      }`}
      onClick={() => {
        if (!n.read) onMarkRead(n._id);
      }}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${icon.bg}`}
      >
        {icon.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${
            !n.read
              ? "font-semibold text-[color:var(--ink)]"
              : "font-medium text-[color:var(--ink-secondary)]"
          }`}
        >
          {n.title}
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
          {n.body}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-[color:var(--ink-muted)]">
            {formatTime(n.createdAt)}
          </span>
          {!n.read && (
            <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
          )}
        </div>
      </div>
    </div>
  );

  if (n.load) {
    return (
      <Link href={`/load/${n.load}`} className="block">
        {inner}
      </Link>
    );
  }

  return <button type="button" className="w-full text-left">{inner}</button>;
}

function BackIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className ?? ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}
