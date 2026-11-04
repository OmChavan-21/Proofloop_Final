/**
 * SMTP Transport Configuration for Gmail and Nodemailer.
 * Reads SMTP credentials from environment variables safely.
 * Never logs or exposes passwords.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  from: string;
}

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER || "proofloop.ai@gmail.com";
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `Proofloop <${user}>`;

  return { host, port, secure, user, pass, from };
}

let customTransporter: Transporter | undefined;

/**
 * Injects a custom or mock mail transporter for testing.
 * Pass undefined to restore the default environment-based transporter.
 */
export function setMailTransporter(transporter: Transporter | undefined): void {
  customTransporter = transporter;
}

export function getActiveMailTransporter(): Transporter | undefined {
  return customTransporter;
}

/**
 * Checks whether SMTP delivery credentials or a mock transporter are configured.
 */
export function isSmtpConfigured(): boolean {
  if (customTransporter) {
    return true;
  }
  const config = getSmtpConfig();
  return Boolean(config.pass && config.pass.trim());
}

/**
 * Creates or retrieves the active mail transporter.
 * Returns null if SMTP_PASS is missing and no mock transporter is injected.
 */
export function createMailTransporter(): Transporter | null {
  if (customTransporter) {
    return customTransporter;
  }

  const config = getSmtpConfig();
  if (!config.pass || !config.pass.trim()) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Gmail recommendations
    tls: {
      rejectUnauthorized: true,
    },
  });
}
