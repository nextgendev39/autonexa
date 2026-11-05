import { timingSafeEqual } from "node:crypto";

import { jsonError, jsonOk } from "@/lib/api/http";
import { runBookingDeadlineSweep } from "@/lib/notifications/service";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduler entry point (e.g. Vercel Cron or any hourly HTTP job) with
 * `Authorization: Bearer $CRON_SECRET`. Applies the booking payment deadlines from
 * Settings and sends the pushes. Disabled when CRON_SECRET is unset.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return jsonError("not_found", "Not found.", 404);
  if (!authorized(request)) return jsonError("unauthorized", "Unauthorized.", 401);
  return jsonOk(await runBookingDeadlineSweep());
}
