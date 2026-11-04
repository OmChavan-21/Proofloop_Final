"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Asterisk } from "lucide-react";
import { ApiError, requestJson, resendVerificationOTP } from "@/lib/auth-api";
import { useTenant } from "@/components/shell/tenant-context";
import { useRouter } from "next/navigation";
import { VerifyEmailForm } from "./verify-email-form";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { refreshSession } = useTenant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const isSignup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "").trim();
    const password = String(fields.get("password") || "");
    const name = String(fields.get("name") || "").trim();
    setBusy(true);
    setError("");

    try {
      if (isSignup) {
        await requestJson("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        // Signup triggers automatic 6-digit OTP delivery; transition to OTP verification screen
        setPendingEmail(email);
      } else {
        await requestJson("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        await refreshSession();
        router.replace("/");
      }
    } catch (cause) {
      if (cause instanceof ApiError && (cause.code === "EMAIL_NOT_VERIFIED" || cause.message.includes("Email not verified") || cause.message.includes("email is not verified"))) {
        // Send a fresh OTP and transition to verification screen
        try {
          await resendVerificationOTP(email);
        } catch {
          // Continue to verification form even if rate-limited or resend failed so user can enter already-sent code
        }
        setPendingEmail(email);
        return;
      }
      setError(cause instanceof Error ? cause.message : "The authentication request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (pendingEmail) {
    return (
      <VerifyEmailForm
        initialEmail={pendingEmail}
        onBack={() => setPendingEmail("")}
        onSuccess={async () => {
          await refreshSession();
          router.replace("/");
        }}
      />
    );
  }

  return (
    <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
      <Link href="/" className="inline-flex items-center gap-2">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand text-white">
          <Asterisk className="size-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Proofloop</span>
      </Link>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.14em] text-brand">Evidence-backed intelligence</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        {isSignup
          ? "Set up an account to create or join a Proofloop organization. We'll send a 6-digit code to verify your email."
          : "Sign in to access your organization and workspace."}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {isSignup ? (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Full name
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={8}
            className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </div>
        {error ? (
          <p className="rounded-lg border border-negative/25 bg-negative-soft p-3 text-sm text-negative" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {isSignup ? "Already have an account?" : "New to Proofloop?"}{" "}
        <Link className="font-medium text-brand hover:underline" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
        Email verification with a 6-digit OTP is mandatory for all accounts. Never share your verification code with anyone.
      </p>
    </section>
  );
}
