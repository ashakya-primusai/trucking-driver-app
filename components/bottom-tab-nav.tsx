"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchDriverUnreadCount } from "@/lib/driver-api";
import {
  useFirebaseEvent,
  type FirebaseDriverNotificationEvent,
} from "@/lib/firebase-realtime";

type TabId = "loads" | "notifications" | "chat";

interface TabDef {
  id: TabId;
  label: string;
  href: string;
  matchPrefix: string[];
  Icon: React.ComponentType<{ active?: boolean }>;
}

const TABS: TabDef[] = [
  { id: "loads", label: "Loads", href: "/home", matchPrefix: ["/home", "/load"], Icon: TruckIcon },
  { id: "notifications", label: "Alerts", href: "/notifications", matchPrefix: ["/notifications"], Icon: BellIcon },
  { id: "chat", label: "Bella", href: "/chat", matchPrefix: ["/chat"], Icon: ChatIcon },
];

export function BottomTabNav() {
  const pathname = usePathname() ?? "";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchDriverUnreadCount()
      .then((res) => {
        if (!cancelled) setUnread(res.data.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useFirebaseEvent<FirebaseDriverNotificationEvent>(
    "driver_notification:new",
    () => setUnread((n) => n + 1)
  );

  return (
    <nav className="bottom-tab-bar" aria-label="Primary">
      <div className="tab-inner">
        {TABS.map(({ id, label, href, matchPrefix, Icon }) => {
          const isActive = matchPrefix.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
          );
          const showBadge = id === "notifications" && unread > 0;

          return (
            <Link
              key={id}
              href={href}
              className={`tab-item ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="relative inline-flex">
                <Icon active={isActive} />
                {showBadge ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-bold leading-none text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TruckIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className="tab-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h10.5v8.25H3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H18l3 3v2.25h-7.5z" />
      <circle cx="7.5" cy="17.25" r="1.75" />
      <circle cx="17.25" cy="17.25" r="1.75" />
    </svg>
  );
}

function BellIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className="tab-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022 23.85 23.85 0 005.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function ChatIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className="tab-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 9.75H15.375M8.625 12.75H12.75M21 12.75a8.25 8.25 0 11-3.166-6.493 8.21 8.21 0 013.166 6.493z"
      />
    </svg>
  );
}
