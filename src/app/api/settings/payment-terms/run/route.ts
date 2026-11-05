import { jsonOk, requireApiUser } from "@/lib/api/http";
import { runBookingDeadlineSweep } from "@/lib/notifications/service";
import { tenantClient } from "@/lib/server/privileged";

/** Applies this dealership's payment deadlines right away (Settings → Run checks now). */
export async function POST() {
  const auth = await requireApiUser("settings.manage");
  if ("response" in auth) return auth.response;
  const { cancelled, balanceOverdue } = await runBookingDeadlineSweep(tenantClient(auth.context));
  return jsonOk({ cancelled, balanceOverdue });
}
