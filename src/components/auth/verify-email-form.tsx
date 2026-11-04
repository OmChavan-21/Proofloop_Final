"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Asterisk, ArrowLeft, Mail, RefreshCw, CheckCircle2 } from "lucide-react";
import { ApiError, resendVerificationOTP, verifyEmailOTP } from "@/lib/auth-api";
import { useTenant } from "@/components/shell/tenant-context";
import { useRouter } from "next/navigation";

export interface VerifyEmailFormProps {
  initialEmail: string;
  onSuccess?: () => void;
  onBack?: () => void;
}

export function VerifyEmailForm({ initialEmail, onSuccess, onBack }: VerifyEmailFormProps) {
  const router = useRouter();
  const { refreshSession } = useTenant();
  const [email] = useState(initialEmail.trim());
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldown]);

  function handleOtpChange(value: string) {
    // Only accept numeric digits up to 6 characters
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setOtp(cleaned);
    if (error) setError("");
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    const cleaned = pasted.replace(/\D/g, "").slice(0, 6);
    if (cleaned) {
      setOtp(cleaned);
      if (error) setError("");
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }
    setVerifying(true);
    setError("");
    setInfo("");

    try {
      const response = await verifyEmailOTP(email, otp);
      if (response.status) {
        setVerified(true);
        setInfo("Email verified successfully! Loading your workspace…");
        await refreshSession();
        if (onSuccess) {
          onSuccess();
        } else {
          router.replace("/");
        }
      }
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.code === "INVALID_OTP") {
          setError("The verification code is incorrect. Please check your email and try again.");
        } else if (cause.code === "OTP_EXPIRED") {
          setError("This verification code has expired (codes are valid for 5 minutes). Please request a new code.");
        } else if (cause.code === "TOO_MANY_ATTEMPTS") {
          setError("Maximum verification attempts (3) exceeded. For security, please request a new verification code.");
        } else if (cause.status === 429) {
          setError("Too many attempts. Please wait a moment before trying again.");
        } else {
          setError(cause.message || "Failed to verify email code.");
        }
      } else {
        setError(cause instanceof Error ? cause.message : "Failed to verify email code.");
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    setInfo("");

    try {
      await resendVerificationOTP(email);
      setInfo("A new 6-digit verification code has been sent to your email.");
      setCooldown(60);
      setOtp("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 429) {
        setError("Rate limit reached. Please wait before requesting another verification code.");
      } else {
        setError(cause instanceof Error ? cause.message : "Failed to send verification code. Please try again.");
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8" aria-labelledby="verify-heading">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand text-white">
            <Asterisk className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Proofloop</span>
        </Link>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Change email</span>
          </button>
        ) : (
          <Link href="/signup" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Sign up</span>
          </Link>
        )}
      </div>

      <div className="mt-7 flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Mail className="size-6" aria-hidden="true" />
      </div>

      <h1 id="verify-heading" className="mt-4 text-2xl font-semibold tracking-tight">
        Verify your email
      </h1>

      <p className="mt-2 text-sm leading-6 text-muted">
        We sent a 6-digit verification code to{" "}
        <strong className="font-semibold text-ink break-all">{email}</strong>.
        Enter the code below to activate your account.
      </p>

      {verified ? (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-positive/25 bg-positive-soft p-4 text-sm font-medium text-positive">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <span>{info}</span>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <div>
            <label htmlFor="otp-input" className="mb-1.5 block text-sm font-medium">
              6-digit verification code
            </label>
            <div className="relative">
              <input
                id="otp-input"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(e) => handleOtpChange(e.target.value)}
                onPaste={handlePaste}
                placeholder="••••••"
                className="min-h-12 w-full rounded-lg border border-line bg-white px-4 text-center font-mono text-2xl font-semibold tracking-[0.5em] text-ink placeholder:font-normal placeholder:tracking-normal placeholder:text-muted/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:text-3xl"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">Code expires in 5 minutes. Enter all 6 numbers.</p>
          </div>

          {error ? (
            <p className="rounded-lg border border-negative/25 bg-negative-soft p-3 text-sm text-negative" role="alert">
              {error}
            </p>
          ) : null}

          {info && !verified ? (
            <p className="rounded-lg border border-brand/25 bg-brand-soft p-3 text-sm text-brand" role="status">
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={otp.length !== 6 || verifying}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? "Verifying code…" : "Verify email"}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-line pt-4 sm:flex-row">
        <p className="text-xs text-muted">Didn&apos;t receive the code?</p>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending || verified}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:font-normal disabled:text-muted disabled:no-underline"
        >
          {resending ? (
            <>
              <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
              <span>Sending new code…</span>
            </>
          ) : cooldown > 0 ? (
            <span>Resend code in {cooldown}s</span>
          ) : (
            <span>Resend code</span>
          )}
        </button>
      </div>
    </section>
  );
}
