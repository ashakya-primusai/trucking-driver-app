"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getToken, setSession } from "@/lib/auth-storage";
import { sendDriverOtp, verifyDriverOtp } from "@/lib/driver-api";
import { signInDriverFirebase } from "@/lib/firebase-auth";
import { ensureDriverRealtimeAttached } from "@/lib/firebase-realtime";
import { Logo } from "@/components/Logo";

const OTP_LENGTH = 6;

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/home");
  }, [router]);

  const onSendOtp = useCallback(async () => {
    setError(null);
    setDevOtpHint(null);
    setLoading(true);
    try {
      const res = await sendDriverOtp(phone);
      if (res.data?.otp) setDevOtpHint(res.data.otp);
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const onVerify = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await verifyDriverOtp(phone, otp);
      const d = res.data.driver;
      setSession(
        res.data.token,
        {
          id: d.id,
          fullName: d.fullName,
          phoneNumber: d.phoneNumber,
          tenantId: d.tenantId,
        },
        { firebaseRealtimeAvailable: res.data.firebaseRealtimeAvailable !== false }
      );
      // Firebase is optional for login; required only for live chat/notifications.
      await signInDriverFirebase(res.data.firebaseToken);
      ensureDriverRealtimeAttached(d.id);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }, [phone, otp, router]);

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        {/* Logo + heading */}
        <div className="mb-8">
          <Logo href="/login" size="sm" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
            {step === "phone" ? "Sign in" : "Verify your number"}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--ink-muted)]">
            {step === "phone"
              ? "Use the phone number on your driver profile."
              : "Enter the 6-digit code we just sent you."}
          </p>
        </div>

        {error ? (
          <div
            className="mb-5 rounded-xl border px-4 py-3 text-sm leading-snug"
            style={{
              borderColor: "color-mix(in srgb, var(--danger) 25%, transparent)",
              background: "var(--danger-soft)",
              color: "var(--danger)",
            }}
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {step === "phone" ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[color:var(--ink-secondary)]">
                Mobile number
              </span>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="driver-input w-full px-4 py-3 text-[16px]"
              />
            </label>
            <button
              type="button"
              disabled={loading || !phone.trim()}
              onClick={onSendOtp}
              className="driver-btn-primary flex w-full items-center justify-center px-4 py-3 text-[15px]"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Sending…
                </span>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {devOtpHint ? (
              <div
                className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm"
                style={{
                  borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
                  background: "var(--accent-soft)",
                  color: "var(--accent-deep)",
                }}
              >
                <span className="font-medium">Dev code</span>
                <span className="font-mono text-[15px] font-bold tracking-widest">
                  {devOtpHint}
                </span>
              </div>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[color:var(--ink-secondary)]">
                Verification code
              </span>
              <OtpField value={otp} onChange={setOtp} disabled={loading} />
            </label>
            <button
              type="button"
              disabled={loading || otp.length < OTP_LENGTH}
              onClick={onVerify}
              className="driver-btn-primary flex w-full items-center justify-center px-4 py-3 text-[15px]"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep("phone");
                setOtp("");
                setDevOtpHint(null);
                setError(null);
              }}
              className="w-full py-1 text-sm font-medium text-[color:var(--ink-muted)] transition hover:text-[color:var(--ink-secondary)]"
            >
              Use a different number
            </button>
          </div>
        )}

        <p className="mt-10 text-center text-xs leading-relaxed text-[color:var(--ink-muted)]">
          Having trouble? Contact your dispatcher for access.
        </p>
      </div>
    </div>
  );
}

function OtpField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusIndex = value.length >= OTP_LENGTH ? OTP_LENGTH - 1 : value.length;

  return (
    <div
      className="relative"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        aria-label="Verification code"
      />
      <div className="flex gap-2">
        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
          const char = value[i] ?? "";
          const isActive = i === focusIndex;
          return (
            <div
              key={i}
              className={`otp-box flex-1 ${char ? "filled" : ""} ${isActive ? "active" : ""}`}
            >
              {char}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden
    />
  );
}
