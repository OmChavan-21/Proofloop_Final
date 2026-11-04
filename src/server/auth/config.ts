import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import { emailOTP } from "better-auth/plugins/email-otp";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { getDatabase, schema } from "../db";
import { sendPasswordResetEmail, sendVerificationOTPEmail } from "../email";

function createAuth() {
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
    database: drizzleAdapter(getDatabase(), { provider: "pg", schema, usePlural: false }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url, token }) => {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          url,
          token,
        });
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
          if (!result.success && !result.skipped) {
            throw new Error(`Email delivery failed: ${result.error || "SMTP delivery error"}`);
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
