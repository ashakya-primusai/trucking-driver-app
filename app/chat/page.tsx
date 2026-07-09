"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { clearSession, getStoredDriver, getToken } from "@/lib/auth-storage";
import { signOutDriverFirebase } from "@/lib/firebase-auth";
import {
  ChatMessage,
  fetchChatHistory,
  sendChatMessage,
} from "@/lib/driver-api";
import { useLocationTracking } from "@/lib/location-tracking-context";
import { FirebaseRealtimeBanner } from "@/components/firebase-realtime-banner";
import {
  ensureDriverRealtimeAttached,
  useFirebaseEvent,
  useFirebaseRealtime,
  type FirebaseDriverChatEvent,
} from "@/lib/firebase-realtime";

function appendBellaFromHttp(
  prev: ChatMessage[],
  reply: string,
  notificationId: string | null,
  stuckReported?: boolean
): ChatMessage[] {
  if (prev.some((m) => m.role === "bella" && m.content === reply)) return prev;
  return [
    ...prev,
    {
      _id: `bella-fallback-${Date.now()}`,
      role: "bella",
      content: reply,
      escalatedToNotification: notificationId,
      stuckReported: stuckReported ?? false,
      createdAt: new Date().toISOString(),
    },
  ];
}

export default function ChatPage() {
  const router = useRouter();
  const { stopTracking } = useLocationTracking();
  const { connected: firebaseConnected, realtimeEnabled } = useFirebaseRealtime();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handleSessionExpired = useCallback(() => {
    stopTracking();
    clearSession();
    void signOutDriverFirebase();
    router.replace("/login");
  }, [router, stopTracking]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const driver = getStoredDriver();
    if (driver?.id) ensureDriverRealtimeAttached(driver.id);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    fetchChatHistory(50)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.data.messages);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && e.message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load chat");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, handleSessionExpired]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useFirebaseEvent<FirebaseDriverChatEvent>(
    "driver_chat:message",
    useCallback((evt) => {
      const m = evt.message;
      if (m.role === "driver") return;
      setMessages((prev) => {
        if (prev.some((p) => p._id === String(m._id))) return prev;
        const withoutFallback = prev.filter(
          (p) =>
            !(
              p.role === "bella" &&
              p._id.startsWith("bella-fallback-") &&
              p.content === m.content
            )
        );
        return [
          ...withoutFallback,
          {
            _id: String(m._id),
            role: m.role,
            content: m.content,
            escalatedToNotification: null,
            createdAt:
              typeof m.createdAt === "string"
                ? m.createdAt
                : new Date(m.createdAt).toISOString(),
          },
        ];
      });
    }, [])
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const optimistic: ChatMessage = {
      _id: `temp-${Date.now()}`,
      role: "driver",
      content: text,
      escalatedToNotification: null,
      stuckReported: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await sendChatMessage(text);
      const { reply, notificationId, stuckReported } = res.data;
      setMessages((prev) => appendBellaFromHttp(prev, reply, notificationId, stuckReported));
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="app-canvas flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      {/* Header */}
      <header className="z-20 shrink-0 border-b border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--ink-muted)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
          >
            <BackIcon />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm">
              B
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-[color:var(--ink)]">
                Bella
              </h1>
              <p className="text-[11px] text-[color:var(--ink-muted)]">
                AI Assistant
                {realtimeEnabled && !firebaseConnected && (
                  <span className="ml-1.5 text-amber-600">· connecting…</span>
                )}
                {!realtimeEnabled && (
                  <span className="ml-1.5 text-amber-600">· offline mode</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Messages area */}
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-1 overflow-y-auto px-4 py-4 sm:px-5">
        <FirebaseRealtimeBanner className="mb-2" />
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--accent)] border-t-transparent" />
              <p className="text-sm text-[color:var(--ink-muted)]">
                Loading chat…
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-2xl font-bold text-white shadow-lg">
              B
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[color:var(--ink)]">
                Hey! I&apos;m Bella
              </p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[color:var(--ink-muted)]">
                Your AI trucking assistant. Ask me about your loads, routes, or
                anything trucking-related. If I can&apos;t help, I&apos;ll loop
                in dispatch.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {[
                "What are my current loads?",
                "HOS rules refresher",
                "I need to talk to dispatch",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--ink-secondary)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg._id} msg={msg} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 px-1 py-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-[10px] font-bold text-white">
                  B
                </div>
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[color:var(--ink-muted)] [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[color:var(--ink-muted)] [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[color:var(--ink-muted)] [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div
            className="rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--line)",
              background: "var(--danger-soft)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="shrink-0 border-t border-[color:var(--line)] bg-[color:var(--surface-glass)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-5">
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Bella…"
            rows={1}
            disabled={sending}
            className="driver-input min-h-[44px] max-h-32 flex-1 resize-none px-4 py-3 text-sm leading-snug"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
            className="driver-btn-primary flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isDriver = msg.role === "driver";
  const isDispatch = msg.role === "dispatch";
  const time = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex gap-2 py-1.5 ${isDriver ? "flex-row-reverse" : "flex-row"}`}
    >
      {!isDriver && (
        <div
          className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
            isDispatch
              ? "bg-gradient-to-br from-blue-500 to-blue-700"
              : "bg-gradient-to-br from-orange-400 to-orange-600"
          }`}
        >
          {isDispatch ? "D" : "B"}
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isDriver
            ? "rounded-br-md bg-[color:var(--accent)] text-white"
            : isDispatch
              ? "rounded-bl-md bg-blue-600 text-white"
              : "rounded-bl-md border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)]"
        }`}
      >
        {isDispatch && (
          <p className="mb-1 text-[10px] font-semibold text-blue-100">Dispatch</p>
        )}
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={`text-[10px] ${
              isDriver || isDispatch
                ? "text-white/60"
                : "text-[color:var(--ink-muted)]"
            }`}
          >
            {time}
          </span>
          {msg.escalatedToNotification && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Sent to dispatch
            </span>
          )}
          {msg.stuckReported && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Load marked stuck
            </span>
          )}
        </div>
      </div>
    </div>
  );
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  );
}
