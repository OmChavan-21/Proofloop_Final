import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getTestInstance } from "better-auth/test";
import { emailOTP } from "better-auth/plugins/email-otp";
import { emailOTPClient } from "better-auth/client/plugins";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { Transporter } from "nodemailer";
import { NextRequest } from "next/server";
import { requireTenant } from "./session";
import * as authConfigModule from "./config";
import { createAuth, setAuth } from "./config";
import { setMailTransporter, sendVerificationOTPEmail } from "../email";
import { POST as authPostRoute } from "../../app/api/auth/[...all]/route";

function createMemoryAuthDb() {
  return {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    invitation: [],
  };
}

describe("Proofloop 6-Digit Email OTP Verification & Route Protection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    setMailTransporter(undefined);
    setAuth(undefined);
  });

  afterEach(() => {
    setMailTransporter(undefined);
    setAuth(undefined);
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("generates exactly 6-digit OTP on signup and dispatches verification email", async () => {
    let capturedOtpData: { email: string; otp: string; type: string } | null = null;

    const { client } = await getTestInstance(
      {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async (data) => {
              capturedOtpData = data;
            },
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    const signup = await client.signUp.email({
      name: "Diana Prince",
      email: "diana@proofloop.ai",
      password: "securepassword123",
    });

    expect(signup.error).toBeNull();
    expect(signup.data?.user.emailVerified).toBe(false);

    // Verify 6-digit OTP payload
    expect(capturedOtpData).not.toBeNull();
    expect(capturedOtpData!.email).toBe("diana@proofloop.ai");
    expect(capturedOtpData!.type).toBe("email-verification");
    expect(capturedOtpData!.otp).toHaveLength(6);
    expect(capturedOtpData!.otp).toMatch(/^\d{6}$/);
  });

  it("verifies email with correct OTP and enables login session", async () => {
    let sentOtp = "";

    const { client } = await getTestInstance(
      {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async ({ otp }) => {
              sentOtp = otp;
            },
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    await client.signUp.email({
      name: "Edward Nygma",
      email: "edward@proofloop.ai",
      password: "password12345",
    });

    // Unverified user is blocked from sign-in
    const blockedSignIn = await client.signIn.email({
      email: "edward@proofloop.ai",
      password: "password12345",
    });
    expect(blockedSignIn.error).not.toBeNull();
    expect(blockedSignIn.error?.status).toBe(403);

    // Verify with the correct 6-digit OTP
    const verifyResult = await client.emailOtp.verifyEmail({
      email: "edward@proofloop.ai",
      otp: sentOtp,
    });
    expect(verifyResult.error).toBeNull();
    expect(verifyResult.data?.status).toBe(true);
    expect(verifyResult.data?.user.emailVerified).toBe(true);

    // Verified user can now sign in successfully
    const allowedSignIn = await client.signIn.email({
      email: "edward@proofloop.ai",
      password: "password12345",
    });
    expect(allowedSignIn.error).toBeNull();
    expect(allowedSignIn.data?.user.emailVerified).toBe(true);
  });

  it("rejects incorrect OTP codes with status 400", async () => {
    const { client } = await getTestInstance(
      {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async () => {},
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    await client.signUp.email({
      name: "Frank Castle",
      email: "frank@proofloop.ai",
      password: "password12345",
    });

    const badVerify = await client.emailOtp.verifyEmail({
      email: "frank@proofloop.ai",
      otp: "999999",
    });
    expect(badVerify.error).not.toBeNull();
    expect(badVerify.error?.status).toBe(400);
  });

  it("rejects expired OTP codes with status 400", async () => {
    let sentOtp = "";

    const { client } = await getTestInstance(
      {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 1, // 1 second expiry for test
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async ({ otp }) => {
              sentOtp = otp;
            },
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    await client.signUp.email({
      name: "Grace Hopper",
      email: "grace@proofloop.ai",
      password: "password12345",
    });

    // Wait for the OTP to expire
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const expiredVerify = await client.emailOtp.verifyEmail({
      email: "grace@proofloop.ai",
      otp: sentOtp,
    });
    expect(expiredVerify.error).not.toBeNull();
    expect(expiredVerify.error?.status).toBe(400);
  });

  it("enforces maximum attempts (3) and locks out further attempts", async () => {
    let sentOtp = "";

    const { client } = await getTestInstance(
      {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async ({ otp }) => {
              sentOtp = otp;
            },
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    await client.signUp.email({
      name: "Harvey Dent",
      email: "harvey@proofloop.ai",
      password: "password12345",
    });

    // 1st failed attempt
    const res1 = await client.emailOtp.verifyEmail({ email: "harvey@proofloop.ai", otp: "000001" });
    expect(res1.error?.status).toBe(400);

    // 2nd failed attempt
    const res2 = await client.emailOtp.verifyEmail({ email: "harvey@proofloop.ai", otp: "000002" });
    expect(res2.error?.status).toBe(400);

    // 3rd failed attempt
    const res3 = await client.emailOtp.verifyEmail({ email: "harvey@proofloop.ai", otp: "000003" });
    expect(res3.error?.status).toBe(400);

    // 4th attempt: blocked by TOO_MANY_ATTEMPTS (403), even with the real OTP
    const res4 = await client.emailOtp.verifyEmail({ email: "harvey@proofloop.ai", otp: sentOtp });
    expect(res4.error?.status).toBe(403);
  });

  it("resends verification OTP and enforces rate limiting", async () => {
    const sentOtps: string[] = [];

    const { client } = await getTestInstance(
      {
        rateLimit: {
          enabled: true,
          window: 60,
          max: 2,
        },
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            rateLimit: {
              window: 60,
              max: 2,
            },
            sendVerificationOTP: async ({ otp }) => {
              sentOtps.push(otp);
            },
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    await client.signUp.email({
      name: "Iris West",
      email: "iris@proofloop.ai",
      password: "password12345",
    });
    expect(sentOtps).toHaveLength(1);

    // Resend 1: allowed
    const resend1 = await client.emailOtp.sendVerificationOtp({
      email: "iris@proofloop.ai",
      type: "email-verification",
    });
    expect(resend1.error).toBeNull();
    expect(sentOtps).toHaveLength(2);

    // Resend 2: allowed
    const resend2 = await client.emailOtp.sendVerificationOtp({
      email: "iris@proofloop.ai",
      type: "email-verification",
    });
    expect(resend2.error).toBeNull();
    expect(sentOtps).toHaveLength(3);

    // Resend 3: Rate limit triggered (429)
    const resend3 = await client.emailOtp.sendVerificationOtp({
      email: "iris@proofloop.ai",
      type: "email-verification",
    });
    expect(resend3.error).not.toBeNull();
    expect(resend3.error?.status).toBe(429);
  });

  it("handles SMTP failure safely without falsely verifying account", async () => {
    const errorSpy = vi.fn();

    const { client } = await getTestInstance(
      {
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            sendVerificationOnSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async () => {
              errorSpy("SMTP connection refused");
              throw new Error("SMTP connection refused");
            },
          }),
        ],
      },
      {
        disableTestUser: true,
        clientOptions: {
          plugins: [emailOTPClient()],
        },
      }
    );

    // Signup attempts to deliver email; SMTP fails and is caught safely
    const signup = await client.signUp.email({
      name: "Unverified Person",
      email: "unverified@proofloop.ai",
      password: "password123",
    });
    expect(signup.data?.user.emailVerified).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith("SMTP connection refused");

    // The user was NOT falsely verified
    const signin = await client.signIn.email({
      email: "unverified@proofloop.ai",
      password: "password123",
    });
    expect(signin.error).not.toBeNull();
    expect(signin.error?.status).toBe(403);
  });

  it("blocks unverified users in requireTenant with 403 Forbidden", async () => {
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: "user-unverified-1", email: "unverified@proofloop.ai", emailVerified: false },
          session: { activeOrganizationId: "org-1" },
        }),
      },
    };

    const getAuthSpy = vi.spyOn(authConfigModule, "getAuth").mockReturnValue(mockAuth as unknown as ReturnType<typeof authConfigModule.getAuth>);

    try {
      await expect(
        requireTenant(new Headers(), "analysis:run")
      ).rejects.toThrow("Email verification is required.");
    } finally {
      getAuthSpy.mockRestore();
    }
  });

  it("rejects unauthenticated requests in requireTenant with 401 Unauthorized", async () => {
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    };

    const getAuthSpy = vi.spyOn(authConfigModule, "getAuth").mockReturnValue(mockAuth as unknown as ReturnType<typeof authConfigModule.getAuth>);

    try {
      await expect(
        requireTenant(new Headers(), "analysis:run")
      ).rejects.toThrow("A valid server session is required.");
    } finally {
      getAuthSpy.mockRestore();
    }
  });

  it("fails closed with 503 when SMTP is not configured in production using production auth configuration", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSmtpPass = process.env.SMTP_PASS;
    delete process.env.SMTP_PASS;
    setMailTransporter(undefined);

    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.BETTER_AUTH_SECRET = "01234567890123456789012345678901";
      process.env.BETTER_AUTH_URL = "http://localhost:3000";

      const auth = createAuth({ database: memoryAdapter(createMemoryAuthDb()) });
      const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unconfigured@proofloop.ai", password: "password123", name: "No SMTP" }),
      }));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.message).toBe("Email delivery service is not configured. Verification codes cannot be sent.");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
      process.env.SMTP_PASS = originalSmtpPass;
    }
  });

  it("fails closed with 502 when email delivery fails during signup exercising production route", async () => {
    process.env.BETTER_AUTH_SECRET = "01234567890123456789012345678901";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    const failingTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error("535-5.7.8 Bad credentials password=supersecret auth=token123")),
    } as unknown as Transporter;

    setMailTransporter(failingTransporter);

    const auth = createAuth({ database: memoryAdapter(createMemoryAuthDb()) });
    setAuth(auth);

    try {
      const request = new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "failing-signup@proofloop.ai", password: "password123", name: "Failing Mailer" }),
      });

      const response = await authPostRoute(request);
      expect(response.status).toBe(502);

      const body = await response.json();
      expect(body.message).toBe("Failed to deliver verification code. Please check your email address or try again.");

      // Ensure no raw SMTP errors, credentials, or tokens leak into client response
      const rawBody = JSON.stringify(body);
      expect(rawBody).not.toContain("535-5.7.8");
      expect(rawBody).not.toContain("supersecret");
      expect(rawBody).not.toContain("token123");
    } finally {
      setMailTransporter(undefined);
      setAuth(undefined);
    }
  });

  it("asserts initial signup succeeds, and then OTP resend fails closed with 502 when delivery fails", async () => {
    process.env.BETTER_AUTH_SECRET = "01234567890123456789012345678901";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    // 1. Working transporter for initial signup
    const workingTransporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: "<initial-signup-ok@proofloop.ai>" }),
    } as unknown as Transporter;

    setMailTransporter(workingTransporter);

    const auth = createAuth({ database: memoryAdapter(createMemoryAuthDb()) });
    setAuth(auth);

    try {
      // Step A: Assert that initial signup succeeds
      const signupRequest = new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "resend-test@proofloop.ai", password: "password123", name: "Resend Tester" }),
      });

      const signupResponse = await authPostRoute(signupRequest);
      expect(signupResponse.status).toBe(200);
      const signupBody = await signupResponse.json();
      expect(signupBody.user).toBeDefined();
      expect(signupBody.user.email).toBe("resend-test@proofloop.ai");
      expect(signupBody.user.emailVerified).toBe(false);
      expect(workingTransporter.sendMail).toHaveBeenCalledTimes(1);

      // Step B: Now configure a failing mailer for resend
      const failingTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error("Connection reset by peer")),
      } as unknown as Transporter;

      setMailTransporter(failingTransporter);

      // Step C: Attempt OTP resend and assert failure
      const resendRequest = new NextRequest("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "resend-test@proofloop.ai", type: "email-verification" }),
      });

      const resendResponse = await authPostRoute(resendRequest);
      expect(resendResponse.status).toBe(502);
      const resendBody = await resendResponse.json();
      expect(resendBody.message).toBe("Failed to deliver verification code. Please check your email address or try again.");
      expect(JSON.stringify(resendBody)).not.toContain("Connection reset");
    } finally {
      setMailTransporter(undefined);
      setAuth(undefined);
    }
  });

  it("proves two simultaneous concurrent auth requests through the actual route have isolated email failure states", async () => {
    process.env.BETTER_AUTH_SECRET = "01234567890123456789012345678901";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    const auth = createAuth({ database: memoryAdapter(createMemoryAuthDb()) });
    setAuth(auth);

    // Controlled mock transporter: fails for account A, succeeds for account B
    const mockTransporter = {
      sendMail: vi.fn().mockImplementation(async (mailOptions: { to: string }) => {
        // Asynchronous delay to force interleaving and simultaneous processing
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (mailOptions.to === "concurrent-fail@proofloop.ai") {
          throw new Error("SMTP connection dropped for failing account");
        }
        return { messageId: "<concurrent-success-msg-id@proofloop.ai>" };
      }),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    try {
      const failRequest = new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "concurrent-fail@proofloop.ai",
          password: "password123",
          name: "Concurrent Failure",
        }),
      });

      const successRequest = new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "concurrent-success@proofloop.ai",
          password: "password123",
          name: "Concurrent Success",
        }),
      });

      // Execute both requests concurrently through the actual route
      const [failResponse, successResponse] = await Promise.all([
        authPostRoute(failRequest),
        authPostRoute(successRequest),
      ]);

      // 1. Failing request must return 502 with safe sanitized message
      expect(failResponse.status).toBe(502);
      const failBody = await failResponse.json();
      expect(failBody.message).toBe("Failed to deliver verification code. Please check your email address or try again.");

      // 2. Successful request must return 200 with user created and NOT polluted by failRequest
      expect(successResponse.status).toBe(200);
      const successBody = await successResponse.json();
      expect(successBody.user).toBeDefined();
      expect(successBody.user.email).toBe("concurrent-success@proofloop.ai");
      expect(successBody.user.emailVerified).toBe(false);

      // 3. Confirm both separate accounts were processed by the mailer
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
    } finally {
      setMailTransporter(undefined);
      setAuth(undefined);
    }
  });

  it("preserves account-enumeration protections during password-reset delivery failures", async () => {
    process.env.BETTER_AUTH_SECRET = "01234567890123456789012345678901";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    const failingTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error("SMTP down")),
    } as unknown as Transporter;

    setMailTransporter(failingTransporter);

    const auth = createAuth({ database: memoryAdapter(createMemoryAuthDb()) });

    try {
      // Case 1: Non-existent user
      const nonExistentResponse = await auth.handler(new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nonexistent@proofloop.ai" }),
      }));

      expect(nonExistentResponse.status).toBe(200);
      const nonExistentBody = await nonExistentResponse.json();
      expect(nonExistentBody.status).toBe(true);
      expect(nonExistentBody.message).toContain("check your email for the reset link");

      // Case 2: Existing user created with delivery failure on reset
      // First create user with working transporter
      const workingTransporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: "<create-ok@proofloop.ai>" }),
      } as unknown as Transporter;
      setMailTransporter(workingTransporter);

      await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "existing-user@proofloop.ai", password: "password123", name: "Existing" }),
      }));

      // Switch back to failing transporter for password reset
      setMailTransporter(failingTransporter);

      const existingResponse = await auth.handler(new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "existing-user@proofloop.ai" }),
      }));

      // Must return identical 200 response to prevent account enumeration
      expect(existingResponse.status).toBe(200);
      const existingBody = await existingResponse.json();
      expect(existingBody.status).toBe(true);
      expect(existingBody.message).toBe(nonExistentBody.message);
    } finally {
      setMailTransporter(undefined);
    }
  });

  it("successfully delivers verification OTP when mock mail transporter is active", async () => {
    const deliveredMails: Array<{ to: string; subject: string; text: string }> = [];

    const mockTransporter = {
      sendMail: vi.fn().mockImplementation(async (opts) => {
        deliveredMails.push(opts);
        return { messageId: "<otp-mock-success-999@proofloop.ai>" };
      }),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    try {
      const result = await sendVerificationOTPEmail({
        to: "recipient@proofloop.ai",
        otp: "654321",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("<otp-mock-success-999@proofloop.ai>");
      expect(deliveredMails).toHaveLength(1);
      expect(deliveredMails[0].to).toBe("recipient@proofloop.ai");
      expect(deliveredMails[0].text).toContain("654321");
      expect(deliveredMails[0].text).toContain("5 minutes");
    } finally {
      setMailTransporter(undefined);
    }
  });
});
