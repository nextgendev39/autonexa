import { firstFieldErrors } from "@/lib/validation";
import { pricingListQuerySchema } from "@/lib/validation/pricing";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { hasPermission } from "@/lib/permissions";
import { listVehiclePricing } from "@/lib/pricing/service";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const can =
    hasPermission(auth.context.permissions, "pricing.view", auth.context.roles) ||
    hasPermission(auth.context.permissions, "vehicle.price.view", auth.context.roles);
  if (!can) {
    return jsonError("forbidden", "You do not have permission to view pricing.", 403);
  }

  const search = new URL(request.url).searchParams;
  const parsed = pricingListQuerySchema.safeParse(Object.fromEntries(search.entries()));
  if (!parsed.success) {
    return jsonError("validation", "Invalid query.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await listVehiclePricing(parsed.data, auth.context);
  if (result.error) {
    return jsonError(
      result.error.code,
      result.error.message,
      result.error.code === "forbidden" ? 403 : 400,
    );
  }
  return jsonOk(result.data);
}
