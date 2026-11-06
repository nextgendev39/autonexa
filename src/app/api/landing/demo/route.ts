import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/http";
import { isMailerConfigured, sendEmail } from "@/lib/email/send-email";
import { hitRateLimit } from "@/lib/server/privileged/storefront";
import { clientAddress } from "@/lib/storefront/address";

const schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    dealership: z.string().trim().max(160).default(""),
    phone: z.string().trim().max(40).default(""),
    email: z.union([z.literal(""), z.string().trim().email().max(160)]).default(""),
    stock: z.string().trim().max(40).default(""),
    notes: z.string().trim().max(2000).default(""),
    website: z.string().default(""),
  })
  .refine((value) => value.phone || value.email);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** A demo request from the public landing page, sent to the team's inbox. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return jsonError("validation", "Please check the form.", 400);
  const lead = parsed.data;

  // Bots fill every field. They get the same answer as people, so they don't learn to skip it.
  if (lead.website) return jsonOk({ ok: true });

  const to = process.env.LANDING_LEADS_EMAIL?.trim() || process.env.SMTP_FROM_EMAIL?.trim();
  if (!to || !isMailerConfigured()) {
    console.error("[landing] demo request lost: LANDING_LEADS_EMAIL or SMTP isn't configured");
    return jsonError("unavailable", "Demo requests aren't available right now.", 503);
  }

  const address = createHash("sha256").update(clientAddress(await headers())).digest("hex");
  const allowed =
    (await hitRateLimit(`landing:${address}`, 5, 60 * 60)) && (await hitRateLimit("landing:all", 60, 60 * 60));
  if (!allowed) return jsonError("rate_limited", "Too many requests. Please try again later.", 429);

  const rows: [string, string][] = [
    ["Name", lead.name],
    ["Dealership", lead.dealership],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Cars in stock", lead.stock],
    ["Notes", lead.notes],
  ];
  const filled = rows.filter(([, value]) => value);

  try {
    await sendEmail({
      to,
      // One line only: these came from a stranger and end up in a mail header.
      subject: `Demo request: ${(lead.dealership || lead.name).replace(/\s+/g, " ")}`,
      text: filled.map(([label, value]) => `${label}: ${value}`).join("\n"),
      html: filled
        .map(([label, value]) => `<p><strong>${label}</strong><br>${escapeHtml(value).replace(/\n/g, "<br>")}</p>`)
        .join(""),
    });
  } catch (error) {
    console.error("[landing] could not send a demo request", error);
    return jsonError("send_failed", "We couldn't send your request.", 502);
  }

  return jsonOk({ ok: true });
}
