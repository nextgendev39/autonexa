import nodemailer, { type Transporter } from "nodemailer";

// Server-only SMTP service. Works with any SMTP provider; everything comes from
// server environment variables (never NEXT_PUBLIC_*).

let transporter: Transporter | null = null;

function smtpConfig() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port,
    // 465 = implicit TLS; other ports (587/25) upgrade with STARTTLS.
    secure: port === 465,
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASSWORD ?? "",
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim() || "",
    fromName: process.env.SMTP_FROM_NAME?.trim() || "AutoNexa",
  };
}

export function isMailerConfigured() {
  const config = smtpConfig();
  return Boolean(config.host && config.user && config.pass && config.fromEmail);
}

function getTransporter() {
  if (transporter) return transporter;
  const config = smtpConfig();
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  return transporter;
}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }) {
  const { fromEmail, fromName } = smtpConfig();
  await getTransporter().sendMail({ from: { name: fromName, address: fromEmail }, ...message });
}
