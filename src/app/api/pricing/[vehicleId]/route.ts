import { firstFieldErrors } from "@/lib/validation";
import { upsertPricingSchema } from "@/lib/validation/pricing";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { hasPermission } from "@/lib/permissions";
import { getVehiclePricingDetail, upsertVehiclePricing } from "@/lib/pricing/service";

type RouteContext = { params: Promise<{ vehicleId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const can =
    hasPermission(auth.context.permissions, "pricing.view", auth.context.roles) ||
    hasPermission(auth.context.permissions, "vehicle.price.view", auth.context.roles) ||
    hasPermission(auth.context.permissions, "vehicle.profit.view", auth.context.roles);
  if (!can) {
    return jsonError("forbidden", "You do not have permission to view pricing.", 403);
  }

  const { vehicleId } = await context.params;
  const result = await getVehiclePricingDetail(vehicleId, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden" ? 403 : result.error.code === "not_found" ? 404 : 400;
    return jsonError(result.error.code, result.error.message, status);
  }
  return jsonOk(result.data);
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const can =
    hasPermission(auth.context.permissions, "pricing.update", auth.context.roles) ||
    hasPermission(auth.context.permissions, "pricing.create", auth.context.roles) ||
    hasPermission(auth.context.permissions, "vehicle.price.edit", auth.context.roles);
  if (!can) {
    return jsonError("forbidden", "You do not have permission to update pricing.", 403);
  }

  const { vehicleId } = await context.params;
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = upsertPricingSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await upsertVehiclePricing(vehicleId, parsed.data, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "conflict"
            ? 409
            : 400;
    return jsonError(result.error.code, result.error.message, status);
  }
  return jsonOk(result.data);
}
