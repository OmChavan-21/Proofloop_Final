"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { useTenant } from "@/components/shell/tenant-context";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useTenant();
  const emailInput = searchParams.get("email") || session?.user.email || "";

  return (
    <VerifyEmailForm
      initialEmail={emailInput}
      onBack={() => {
        router.push("/signup");
      }}
    />
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Loading verification…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
