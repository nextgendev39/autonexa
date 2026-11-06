import { emailLogoHtml } from "@/lib/email/brand";

export type DemoRequestLead = {
  name: string;
  dealership: string;
  phone: string;
  email: string;
  stock: string;
  notes: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The team's notification for a demo request from the landing page. Every field came from a stranger. */
export function demoRequestEmail(lead: DemoRequestLead, receivedAt = new Date()) {
  const who = lead.dealership || lead.name;
  // One line only: it ends up in a mail header.
  const subject = `New demo request: ${who.replace(/\s+/g, " ")}`;
  const when = receivedAt.toUTCString();

  const rows: [string, string][] = [
    ["Name", lead.name],
    ["Dealership", lead.dealership],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Cars in stock", lead.stock],
  ];
  const filled = rows.filter(([, value]) => value);

  const digits = lead.phone.replace(/[^\d+]/g, "");
  const actions: [string, string][] = [];
  if (lead.email) actions.push(["Reply by email", `mailto:${encodeURIComponent(lead.email)}`]);
  if (digits) actions.push(["Call", `tel:${digits}`]);
  if (digits.replace(/\D/g, "")) actions.push(["WhatsApp", `https://wa.me/${digits.replace(/\D/g, "")}`]);

  const text = [
    "AUTONEXA · New demo request",
    "",
    ...filled.map(([label, value]) => `${label}: ${value}`),
    ...(lead.notes ? ["", "Notes:", lead.notes] : []),
    "",
    `Received ${when}`,
    lead.email ? "Reply to this email to answer them directly." : "They left no email, so contact them by phone.",
  ].join("\n");

  const detailRows = filled
    .map(
      ([label, value]) => `<tr>
              <td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:13px;color:#7a858f;width:130px;vertical-align:top">${label}</td>
              <td style="padding:10px 0;border-bottom:1px solid #ece7dd;font-size:15px;color:#1a2126;font-weight:500">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join("");

  const notes = lead.notes
    ? `<p style="margin:24px 0 8px;font-size:13px;color:#7a858f">Notes</p>
            <p style="margin:0;padding:16px;background:#f4f1eb;border-radius:8px;font-size:14px;line-height:1.6;color:#1a2126">${escapeHtml(lead.notes).replace(/\n/g, "<br>")}</p>`
    : "";

  const buttons = actions
    .map(
      ([label, href], index) =>
        `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;${
          index === 0 ? "background:#000000;color:#d4af6a" : "background:#f4f1eb;color:#1a2126"
        }">${label}</a>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f1eb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a2126">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
          <tr><td style="background:#000000;padding:18px 32px">
            ${emailLogoHtml()}
          </td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#8a6a35">New demo request</p>
            <p style="margin:0 0 24px;font-size:22px;font-weight:600">${escapeHtml(who)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${detailRows}
            </table>
            ${notes}
            ${buttons ? `<div style="margin-top:28px">${buttons}</div>` : ""}
            <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#7a858f">
              Received ${when} from the AutoNexa landing page.<br>
              ${lead.email ? "Replying to this email goes straight to them." : "They left no email, so contact them by phone."}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html, replyTo: lead.email || undefined };
}
