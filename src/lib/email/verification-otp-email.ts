import { emailLogoHtml } from "@/lib/email/brand";
import { sendEmail } from "@/lib/email/send-email";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type OtpEmailPurpose = "verify" | "passwordReset";

const COPY: Record<
  OtpEmailPurpose,
  {
    subject: string;
    heading: string;
    textHeading: string;
    codeLabel: string;
    link: string;
    textLink: string;
    ignore: string;
    arabic: string;
  }
> = {
  verify: {
    subject: "Verify your AutoNexa account",
    heading: "Verify your email",
    textHeading: "Verify your email address",
    codeLabel: "Your verification code is:",
    link: "Open the verification page",
    textLink: "Enter it on the verification page",
    ignore: "If you did not create a AutoNexa account, you can ignore this email.",
    arabic: "رمز التحقق الخاص بك أعلاه، وينتهي خلال {minutes} دقائق. لا تشارك هذا الرمز مع أي شخص.",
  },
  passwordReset: {
    subject: "Reset your AutoNexa password",
    heading: "Reset your password",
    textHeading: "Reset your password",
    codeLabel: "Your password reset code is:",
    link: "Open the password reset page",
    textLink: "Enter it on the password reset page",
    ignore:
      "If you did not ask to reset your password, you can ignore this email. Your password will not change.",
    arabic:
      "رمز إعادة تعيين كلمة المرور أعلاه، وينتهي خلال {minutes} دقائق. لا تشارك هذا الرمز مع أي شخص. إذا لم تطلب ذلك، تجاهل هذا البريد.",
  },
};

export function verificationOtpEmail({
  otp,
  expiresInMinutes,
  verifyUrl,
  purpose = "verify",
}: {
  otp: string;
  expiresInMinutes: number;
  verifyUrl: string;
  purpose?: OtpEmailPurpose;
}) {
  const copy = COPY[purpose];
  const code = escapeHtml(otp);
  const href = escapeHtml(verifyUrl);
  const subject = copy.subject;

  const text = [
    "AUTONEXA",
    "",
    copy.textHeading,
    "",
    copy.codeLabel,
    "",
    `    ${otp}`,
    "",
    `This code expires in ${expiresInMinutes} minutes.`,
    "",
    "For your security, do not share this code with anyone.",
    "",
    `${copy.textLink}: ${verifyUrl}`,
    "",
    copy.ignore,
    "",
    "Regards,",
    "AutoNexa",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f1eb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a2126">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
          <tr><td style="background:#000000;padding:18px 32px">
            ${emailLogoHtml()}
          </td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 8px;font-size:22px;font-weight:600">${copy.heading}</p>
            <p style="margin:0 0 24px;font-size:15px;color:#4a5560">${copy.codeLabel}</p>
            <p style="margin:0 0 24px;padding:16px;background:#f4f1eb;border-radius:8px;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${code}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#4a5560">This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
            <p style="margin:0 0 24px;font-size:14px;color:#4a5560">For your security, do not share this code with anyone.</p>
            <p style="margin:0 0 24px;font-size:14px"><a href="${href}" style="color:#8a6a35">${copy.link}</a></p>
            <p dir="rtl" style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#4a5560">
              ${copy.arabic.replace("{minutes}", String(expiresInMinutes))}
            </p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#7a858f">
              ${copy.ignore}<br><br>
              Regards,<br>AutoNexa
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export async function sendVerificationOtpEmail({
  email,
  otp,
  expiresInMinutes,
  verifyUrl,
  purpose,
}: {
  email: string;
  otp: string;
  expiresInMinutes: number;
  verifyUrl: string;
  purpose?: OtpEmailPurpose;
}) {
  await sendEmail({
    to: email,
    ...verificationOtpEmail({ otp, expiresInMinutes, verifyUrl, purpose }),
  });
}
