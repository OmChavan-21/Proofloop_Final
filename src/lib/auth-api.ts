export type AuthUser = { id: string; email: string; name: string; emailVerified?: boolean };
export type AuthSession = {
  user: AuthUser;
  session: { activeOrganizationId?: string | null };
};
export type OrganizationItem = { id: string; name: string; slug: string };
export type WorkspaceItem = { id: string; name: string; createdAt: string };

export type AuthErrorPayload = { message?: string; error?: string; code?: string };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = (typeof payload === "object" && payload !== null ? payload : {}) as AuthErrorPayload;
    const message = body.message || body.error || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, body.code);
  }
  return payload as T;
}

export async function verifyEmailOTP(email: string, otp: string) {
  return requestJson<{ status: boolean; token?: string; user?: AuthUser }>(
    "/api/auth/email-otp/verify-email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase().trim(), otp: otp.trim() }),
    }
  );
}

export async function resendVerificationOTP(email: string) {
  return requestJson<{ success: boolean }>(
    "/api/auth/email-otp/send-verification-otp",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase().trim(), type: "email-verification" }),
    }
  );
}
