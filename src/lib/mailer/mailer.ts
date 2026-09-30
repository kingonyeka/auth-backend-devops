import nodemailer from 'nodemailer';
import { env } from '../../config';

// SMTP keeps this provider-agnostic: Mailpit locally, and later SES's SMTP
// endpoint (or any provider) purely by changing env vars. No code change.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false, // STARTTLS is negotiated automatically when the server offers it
  auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(options: MailOptions): Promise<void> {
  await transporter.sendMail({ from: env.MAIL_FROM, ...options });
}