import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import { emailOTP } from "better-auth/plugins/email-otp";
import { emailOTPClient } from "better-auth/client/plugins";
import { requireTenant, AuthError } from "./session";
import * as authConfigModule from "./config";

describe("Proofloop 6-Digit Email OTP Verification & Route Protection", () => {
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

    const getAuthSpy = vi.spyOn(authConfigModule, "getAuth").mockReturnValue(mockAuth as any);

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

    const getAuthSpy = vi.spyOn(authConfigModule, "getAuth").mockReturnValue(mockAuth as any);

    try {
      await expect(
        requireTenant(new Headers(), "analysis:run")
      ).rejects.toThrow("A valid server session is required.");
    } finally {
      getAuthSpy.mockRestore();
    }
  });
});
