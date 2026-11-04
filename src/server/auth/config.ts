import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import { emailOTP } from "better-auth/plugins/email-otp";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { getDatabase, schema } from "../db";
import { isSmtpConfigured, sendPasswordResetEmail, sendVerificationOTPEmail } from "../email";

export interface EmailDeliveryContext {
  failed: boolean;
  error?: string;
}

export const emailDeliveryStorage = new AsyncLocalStorage<EmailDeliveryContext>();

export function createAuth(options?: { database?: Parameters<typeof betterAuth>[0]["database"] }) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (!baseURL) throw new Error("BETTER_AUTH_URL must be configured.");

  const ac = createAccessControl(defaultStatements);
  const owner = ac.newRole({ organization: ["update", "delete"], member: ["create", "update", "delete"], invitation: ["create", "cancel"], team: ["create", "update", "delete"], ac: ["create", "read", "update", "delete"] });
  const admin = ac.newRole({ organization: ["update"], member: ["create", "update", "delete"], invitation: ["create", "cancel"], team: ["create", "update", "delete"], ac: ["create", "read", "update", "delete"] });
  const analyst = ac.newRole({ organization: [], member: [], invitation: [], team: [], ac: ["read"] });
  const viewer = ac.newRole({ organization: [], member: [], invitation: [], team: [], ac: ["read"] });

  return betterAuth({
    appName: "Proofloop",
    baseURL,
    secret,
    database: options?.database ?? drizzleAdapter(getDatabase(), { provider: "pg", schema, usePlural: false }),
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const isAuthDeliveryPath =
          ctx.path === "/sign-up/email" ||
          ctx.path === "/email-otp/send-verification-otp";

        if (isAuthDeliveryPath && !isSmtpConfigured() && process.env.NODE_ENV !== "test") {
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: "Email delivery service is not configured. Verification codes cannot be sent."
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const store = emailDeliveryStorage.getStore();
        const isAuthDeliveryPath =
          ctx.path === "/sign-up/email" ||
          ctx.path === "/email-otp/send-verification-otp";

        if (isAuthDeliveryPath && store?.failed) {
          throw new APIError("BAD_GATEWAY", {
            message: "Failed to deliver verification code. Please check your email address or try again."
          });
        }
      }),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url, token }) => {
        const result = await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          url,
          token,
        });
        if (!result.success && !(process.env.NODE_ENV === "test" && result.skipped)) {
          process.stderr.write("[Proofloop Mailer] Password reset email delivery failed.\n");
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    trustedOrigins: [baseURL],
    plugins: [
      organization({
        creatorRole: "owner",
        ac,
        roles: { owner, admin, analyst, viewer }
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        rateLimit: {
          window: 60,
          max: 3,
        },
        sendVerificationOTP: async ({ email, otp, type }) => {
          const result = await sendVerificationOTPEmail({
            to: email,
            otp,
            type,
          });
          if (process.env.NODE_ENV === "test" && result.skipped) {
            return;
          }
          if (!result.success) {
            const store = emailDeliveryStorage.getStore();
            if (store) {
              store.failed = true;
              store.error = "Verification code could not be delivered.";
            }
            throw new Error("Verification code could not be delivered.");
          }
        },
      }),
    ]
  });
}

let configuredAuth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (configuredAuth ??= createAuth());
}

export function setAuth(auth: ReturnType<typeof createAuth> | undefined) {
  configuredAuth = auth;
}
