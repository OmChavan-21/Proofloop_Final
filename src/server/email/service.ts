/**
 * Email Delivery Service for Proofloop.
 * Handles email verification, password resets, and generic notifications.
 * Ensures credentials and sensitive tokens are never logged or leaked on failure.
 */

import { createMailTransporter, getSmtpConfig } from "./transport";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

export async function sendEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
  const transporter = createMailTransporter();
  const config = getSmtpConfig();

  if (!transporter) {
    const isTest = process.env.NODE_ENV === "test";
    if (!isTest) {
      process.stderr.write(
        "[Proofloop Mailer] Error: SMTP_PASS is not configured. Outgoing email was not delivered.\n"
      );
    }
    return {
      success: false,
      skipped: isTest,
      error: isTest ? "SMTP_PASS is not configured on the server." : "SMTP delivery service is not configured.",
    };
  }

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    // Sanitized logging: never include credentials, passwords, recipient addresses, or raw auth headers
    const rawError = error instanceof Error ? error.message : "SMTP delivery failed";
    const sanitizedError = rawError
      .replaceAll(options.to, "[REDACTED_RECIPIENT]")
      .replace(/pass(word)?\s*[:=]\s*\S+/gi, "password=[REDACTED]")
      .replace(/auth\s*[:=]\s*\S+/gi, "auth=[REDACTED]")
      .replace(/token\s*[:=]\s*\S+/gi, "token=[REDACTED]");

    process.stderr.write(`[Proofloop Mailer] Error delivering outgoing email: ${sanitizedError}\n`);
    return {
      success: false,
      error: sanitizedError,
    };
  }
}

export interface VerificationEmailParams {
  to: string;
  name?: string;
  url: string;
  token?: string;
}

export interface VerificationOTPEmailParams {
  to: string;
  otp: string;
  type?: string;
}

export async function sendVerificationOTPEmail({
  to,
  otp,
}: VerificationOTPEmailParams): Promise<EmailDeliveryResult> {
  const subject = "Your Proofloop verification code";
  const text = `Hello,\n\nYour 6-digit Proofloop verification code is:\n\n${otp}\n\nThis verification code will expire in 5 minutes.\n\nIf you did not request a verification code, you can safely ignore this email.\n\n— The Proofloop Team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Your Proofloop verification code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
    <div style="margin-bottom: 24px;">
      <span style="color: #2563eb; font-weight: 700; font-size: 20px; letter-spacing: -0.5px;">Proofloop</span>
    </div>
    <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a;">Verify your email address</h2>
    <p style="font-size: 14px; line-height: 24px; color: #475569; margin-bottom: 24px;">
      Use the 6-digit verification code below to verify your email address and activate your Proofloop account.
    </p>
    <div style="margin-bottom: 28px; background-color: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
        ${otp}
      </span>
    </div>
    <p style="font-size: 13px; line-height: 20px; color: #64748b; margin-bottom: 24px;">
      This code is valid for <strong>5 minutes</strong>. If you did not request this code, you can safely ignore this email.
    </p>
    <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      — The Proofloop Team
    </p>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}

export async function sendVerificationEmail({
  to,
  name,
  url,
}: VerificationEmailParams): Promise<EmailDeliveryResult> {
  const recipientName = name ? name.trim() : "there";
  const subject = "Verify your Proofloop account";
  const text = `Hello ${recipientName},\n\nPlease verify your email address for Proofloop by visiting the following link:\n${url}\n\nThis verification link will expire in 24 hours.\n\nIf you did not create a Proofloop account, you can safely ignore this email.\n\n— The Proofloop Team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verify your Proofloop account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
    <div style="margin-bottom: 24px;">
      <span style="color: #2563eb; font-weight: 700; font-size: 20px; letter-spacing: -0.5px;">Proofloop</span>
    </div>
    <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a;">Verify your email address</h2>
    <p style="font-size: 14px; line-height: 24px; color: #475569; margin-bottom: 24px;">
      Hello ${recipientName}, thanks for signing up for Proofloop. Please click the button below to confirm your email address and activate your account.
    </p>
    <div style="margin-bottom: 28px;">
      <a href="${url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; display: inline-block;">
        Verify Email Address
      </a>
    </div>
    <p style="font-size: 12px; line-height: 20px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      If the button above does not work, copy and paste this link into your browser:<br>
      <a href="${url}" style="color: #2563eb; word-break: break-all;">${url}</a>
    </p>
    <p style="font-size: 12px; color: #94a3b8; margin-top: 16px;">
      If you did not sign up for Proofloop, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}

export interface PasswordResetEmailParams {
  to: string;
  name?: string;
  url: string;
  token?: string;
}

export async function sendPasswordResetEmail({
  to,
  name,
  url,
}: PasswordResetEmailParams): Promise<EmailDeliveryResult> {
  const recipientName = name ? name.trim() : "there";
  const subject = "Reset your Proofloop password";
  const text = `Hello ${recipientName},\n\nWe received a request to reset your password for your Proofloop account. Visit the link below to choose a new password:\n${url}\n\nThis reset link will expire in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.\n\n— The Proofloop Team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset your Proofloop password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
    <div style="margin-bottom: 24px;">
      <span style="color: #2563eb; font-weight: 700; font-size: 20px; letter-spacing: -0.5px;">Proofloop</span>
    </div>
    <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a;">Reset your password</h2>
    <p style="font-size: 14px; line-height: 24px; color: #475569; margin-bottom: 24px;">
      Hello ${recipientName}, we received a request to reset your password for Proofloop. Click the button below to set a new password.
    </p>
    <div style="margin-bottom: 28px;">
      <a href="${url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; display: inline-block;">
        Reset Password
      </a>
    </div>
    <p style="font-size: 12px; line-height: 20px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      If the button above does not work, copy and paste this link into your browser:<br>
      <a href="${url}" style="color: #2563eb; word-break: break-all;">${url}</a>
    </p>
    <p style="font-size: 12px; color: #94a3b8; margin-top: 16px;">
      If you did not request a password reset, you can safely ignore this email. Your account remains secure.
    </p>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}
