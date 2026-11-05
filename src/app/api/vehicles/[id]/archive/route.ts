import { firstFieldErrors } from "@/lib/validation";
import { archiveVehicleSchema } from "@/lib/validation/vehicle";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { archiveVehicle } from "@/lib/vehicles/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = archiveVehicleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await archiveVehicle(id, parsed.data, auth.context);
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
