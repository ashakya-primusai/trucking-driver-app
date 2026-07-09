"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getToken } from "@/lib/auth-storage";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? "/home" : "/login");
  }, [router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
      <p className="text-sm font-medium text-[color:var(--ink-muted)]">Starting…</p>
    </div>
  );
}
