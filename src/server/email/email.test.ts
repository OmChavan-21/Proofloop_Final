import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transporter } from "nodemailer";
import {
  getSmtpConfig,
  isSmtpConfigured,
  setMailTransporter,
  createMailTransporter,
  sendEmail,
  sendVerificationEmail,
  sendVerificationOTPEmail,
  sendPasswordResetEmail,
} from "./index";

describe("Email Delivery & SMTP Service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    setMailTransporter(undefined);
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "proofloop.ai@gmail.com";
    delete process.env.SMTP_PASS;
  });

  afterEach(() => {
    setMailTransporter(undefined);
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("resolves default Gmail SMTP configuration correctly", () => {
    const config = getSmtpConfig();
    expect(config.host).toBe("smtp.gmail.com");
    expect(config.port).toBe(587);
    expect(config.secure).toBe(false);
    expect(config.user).toBe("proofloop.ai@gmail.com");
    expect(config.from).toBe("Proofloop <proofloop.ai@gmail.com>");
    expect(config.pass).toBeUndefined();
  });

  it("handles unconfigured SMTP_PASS gracefully without crashing or throwing", async () => {
    delete process.env.SMTP_PASS;
    expect(createMailTransporter()).toBeNull();

    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test Subject",
      text: "Test plain text",
      html: "<p>Test html</p>",
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.error).toContain("SMTP_PASS is not configured");
  });

  it("delivers verification emails using the injected mock transporter without sending real emails", async () => {
    const sentMessages: Array<{
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }> = [];

    const mockTransporter = {
      sendMail: vi.fn().mockImplementation(async (mailOptions) => {
        sentMessages.push(mailOptions);
        return { messageId: "<mock-verification-id-123@proofloop.ai>" };
      }),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    const result = await sendVerificationEmail({
      to: "alice@example.com",
      name: "Alice Vance",
      url: "https://proofloop.ai/verify-email?token=verify-tok-123&callbackURL=%2F",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("<mock-verification-id-123@proofloop.ai>");
    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);

    expect(sentMessages).toHaveLength(1);
    const sent = sentMessages[0];
    expect(sent.to).toBe("alice@example.com");
    expect(sent.subject).toBe("Verify your Proofloop account");
    expect(sent.text).toContain("Hello Alice Vance");
    expect(sent.text).toContain("https://proofloop.ai/verify-email?token=verify-tok-123");
    expect(sent.html).toContain("Alice Vance");
    expect(sent.html).toContain("https://proofloop.ai/verify-email?token=verify-tok-123");
    expect(sent.html).toContain("Verify Email Address");
  });

  it("delivers 6-digit OTP verification emails with 5-minute expiry using injected mock transporter", async () => {
    const sentMessages: Array<{
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }> = [];

    const mockTransporter = {
      sendMail: vi.fn().mockImplementation(async (mailOptions) => {
        sentMessages.push(mailOptions);
        return { messageId: "<mock-otp-id-789@proofloop.ai>" };
      }),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    const result = await sendVerificationOTPEmail({
      to: "bob@example.com",
      otp: "847291",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("<mock-otp-id-789@proofloop.ai>");
    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);

    expect(sentMessages).toHaveLength(1);
    const sent = sentMessages[0];
    expect(sent.to).toBe("bob@example.com");
    expect(sent.subject).toBe("Your Proofloop verification code");
    expect(sent.text).toContain("847291");
    expect(sent.text).toContain("5 minutes");
    expect(sent.html).toContain("847291");
    expect(sent.html).toContain("5 minutes");
    expect(sent.html).toContain("Proofloop");
  });

  it("delivers password reset emails using the injected mock transporter", async () => {
    const sentMessages: Array<{
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }> = [];

    const mockTransporter = {
      sendMail: vi.fn().mockImplementation(async (mailOptions) => {
        sentMessages.push(mailOptions);
        return { messageId: "<mock-reset-id-456@proofloop.ai>" };
      }),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    const result = await sendPasswordResetEmail({
      to: "bob@example.com",
      name: "Bob Roberts",
      url: "https://proofloop.ai/reset-password/reset-tok-456?callbackURL=%2F",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("<mock-reset-id-456@proofloop.ai>");
    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);

    expect(sentMessages).toHaveLength(1);
    const sent = sentMessages[0];
    expect(sent.to).toBe("bob@example.com");
    expect(sent.subject).toBe("Reset your Proofloop password");
    expect(sent.text).toContain("Hello Bob Roberts");
    expect(sent.text).toContain("https://proofloop.ai/reset-password/reset-tok-456");
    expect(sent.html).toContain("Reset your password");
    expect(sent.html).toContain("https://proofloop.ai/reset-password/reset-tok-456");
    expect(sent.html).toContain("Reset Password");
  });

  it("safely handles SMTP transport errors without leaking credentials", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const mockTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error("535-5.7.8 Username and Password not accepted")),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    const result = await sendEmail({
      to: "victim@example.com",
      subject: "Test",
      text: "Body",
      html: "<p>Body</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("535-5.7.8 Username and Password not accepted");
    expect(stderrSpy).toHaveBeenCalled();
    const loggedError = stderrSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(loggedError).toContain("535-5.7.8 Username and Password not accepted");
    // Ensure no password or secret token was logged
    expect(loggedError).not.toContain("password=");
    expect(loggedError).not.toContain("auth=");
  });

  it("accurately detects SMTP configuration status via isSmtpConfigured()", () => {
    delete process.env.SMTP_PASS;
    setMailTransporter(undefined);
    expect(isSmtpConfigured()).toBe(false);

    process.env.SMTP_PASS = "sample-app-password";
    expect(isSmtpConfigured()).toBe(true);

    delete process.env.SMTP_PASS;
    const mockTransporter = {} as unknown as Transporter;
    setMailTransporter(mockTransporter);
    expect(isSmtpConfigured()).toBe(true);
  });

  it("fails closed without skipping when SMTP_PASS is missing in non-test mode", async () => {
    delete process.env.SMTP_PASS;
    setMailTransporter(undefined);

    const originalNodeEnv = process.env.NODE_ENV;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      const result = await sendEmail({
        to: "prod-user@example.com",
        subject: "Prod Test",
        text: "Body",
        html: "<p>Body</p>",
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.error).toBe("SMTP delivery service is not configured.");
      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  });

  it("redacts sensitive credential fragments in caught transport errors", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const mockTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error("SMTP Error: password=supersecret auth=token123 token=abc456")),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    const result = await sendEmail({
      to: "victim@example.com",
      subject: "Test",
      text: "Body",
      html: "<p>Body</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain("supersecret");
    expect(result.error).not.toContain("token123");
    expect(result.error).not.toContain("abc456");
    expect(result.error).toContain("[REDACTED]");

    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("supersecret");
    expect(logged).not.toContain("token123");
    expect(logged).toContain("[REDACTED]");
  });

  it("never logs recipient email addresses in error logs", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const mockTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error("SMTP delivery failure: mailbox unavailable for confidential-user@client.com")),
    } as unknown as Transporter;

    setMailTransporter(mockTransporter);

    await sendEmail({
      to: "confidential-user@client.com",
      subject: "Confidential Subject",
      text: "Body",
      html: "<p>Body</p>",
    });

    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("confidential-user@client.com");
    expect(logged).toContain("[REDACTED_RECIPIENT]");
  });
});
