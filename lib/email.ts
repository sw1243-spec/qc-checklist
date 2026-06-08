import nodemailer from "nodemailer";
import { readConfig } from "@/lib/config";

export function getTransporter() {
  const cfg = readConfig();
  if (!cfg.emailSmtpHost || !cfg.emailSmtpPort || !cfg.emailSmtpUser) {
    throw new Error("SMTP settings are incomplete");
  }
  return nodemailer.createTransport({
    host: cfg.emailSmtpHost,
    port: cfg.emailSmtpPort,
    secure: cfg.emailSmtpPort === 465, // 465 = SSL, 587 = STARTTLS
    auth: {
      user: cfg.emailSmtpUser,
      pass: cfg.emailSmtpPass ?? "",
    },
  });
}

export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = readConfig();
    if (!cfg.emailEnabled) return { ok: false, error: "Email is disabled" };

    const transporter = getTransporter();
    await transporter.sendMail({
      from: cfg.emailFrom ?? cfg.emailSmtpUser,
      to,
      subject,
      text: text ?? html.replace(/<[^>]+>/g, ""),
      html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendTestEmail(): Promise<{ ok: boolean; error?: string }> {
  const cfg = readConfig();
  if (!cfg.emailTo) return { ok: false, error: "Recipient (Email To) is empty" };
  return sendMail({
    to: cfg.emailTo,
    subject: "✅ QC Check Sheet — SMTP test",
    html: `<p>This is a test message from your QC Check Sheet system.</p>
           <p>If you received this, your SMTP settings are working correctly.</p>
           <p style="color:#9b9b98;font-size:12px;margin-top:24px">Sent at ${new Date().toLocaleString()}</p>`,
  });
}
