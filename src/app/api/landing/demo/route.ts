import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/http";
import { demoRequestEmail } from "@/lib/email/demo-request-email";
import { isMailerConfigured, sendEmail } from "@/lib/email/send-email";
import { markDemoRequestEmailed, saveDemoRequest } from "@/lib/server/privileged/demo-requests";
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
    locale: z.enum(["en", "ar"]).catch("en"),
  })
  .refine((value) => value.phone || value.email);

/**
 * A demo request from the public landing page. It is stored for the platform console and emailed
 * to the team's inbox; either one is enough for the visitor to hear back.
 */
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

  const address = createHash("sha256").update(clientAddress(await headers())).digest("hex");
  const allowed =
    (await hitRateLimit(`landing:${address}`, 5, 60 * 60)) && (await hitRateLimit("landing:all", 60, 60 * 60));
  if (!allowed) return jsonError("rate_limited", "Too many requests. Please try again later.", 429);

  const saved = await saveDemoRequest(lead);

  const to = process.env.LANDING_LEADS_EMAIL?.trim() || process.env.SMTP_FROM_EMAIL?.trim();
  let emailed = false;
  if (to && isMailerConfigured()) {
    try {
      await sendEmail({ to, ...demoRequestEmail(lead) });
      emailed = true;
    } catch (error) {
      console.error("[landing] could not email a demo request", error);
    }
  }
  if (saved && emailed) await markDemoRequestEmailed(saved);

  if (!saved && !emailed) {
    console.error("[landing] demo request lost: it could be neither stored nor emailed");
    return jsonError("unavailable", "We couldn't send your request.", 503);
  }

  return jsonOk({ ok: true });
}
