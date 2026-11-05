import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { canSellDirectly, listBookingOptions } from "@/lib/bookings/service";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  // The same options serve the booking form and the direct sale form.
  const { context } = auth;
  if (!hasPermission(context.permissions, "reservation.create", context.roles) && !canSellDirectly(context)) {
    return jsonError("forbidden", "You do not have permission to perform this action.", 403);
  }
  const result = await listBookingOptions(context);
  if (result.error) return jsonError(result.error.code, result.error.message, 400);
  return jsonOk(result.data);
}
