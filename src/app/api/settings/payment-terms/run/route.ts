import { jsonOk, requireApiUser } from "@/lib/api/http";
import { runBookingDeadlineSweep } from "@/lib/notifications/service";

/** Applies the payment deadlines right away (Settings → Run checks now). */
export async function POST() {
  const auth = await requireApiUser("settings.manage");
  if ("response" in auth) return auth.response;
  return jsonOk(await runBookingDeadlineSweep());
}
