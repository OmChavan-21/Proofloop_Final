"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { useTenant } from "@/components/shell/tenant-context";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const { session } = useTenant();
  const [emailInput, setEmailInput] = useState(
    searchParams.get("email") || session?.user.email || ""
  );

  return (
    <VerifyEmailForm
      initialEmail={emailInput}
      onBack={() => {
        window.location.href = "/signup";
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
