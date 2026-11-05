import { firstFieldErrors } from "@/lib/validation";
import { vehicleFormRules, vehicleListQuerySchema } from "@/lib/validation/vehicle";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { canEditVehiclePrice, createVehicle, listVehicles } from "@/lib/vehicles/service";

export async function GET(request: Request) {
  const auth = await requireApiUser("vehicle.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = vehicleListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", "Invalid query parameters.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const hideInTransit = !auth.context.roles.includes("super_admin");
  const result = await listVehicles({ ...parsed.data, hideInTransit }, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, 400);
  }
  return jsonOk(result.data);
}

export async function POST(request: Request) {
  const auth = await requireApiUser("vehicle.create");
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = vehicleFormRules({ requirePricing: canEditVehiclePrice(auth.context) }).safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await createVehicle(parsed.data, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "duplicate_vin" || result.error.code === "duplicate_chassis"
          ? 409
          : 400;
    return jsonError(result.error.code, result.error.message, status, {
      fieldErrors: result.error.fieldErrors,
      details: result.error.existingVehicleId
        ? { existingVehicleId: result.error.existingVehicleId }
        : undefined,
    });
  }

  return jsonOk(result.data, { status: 201 });
}
