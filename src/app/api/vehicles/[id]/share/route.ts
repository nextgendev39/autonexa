import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import {
  createVehicleShareLink,
  getSharedVehicle,
  missingShareDetails,
} from "@/lib/vehicles/share";

type RouteContext = { params: Promise<{ id: string }> };

/** Returns the caller's public link for this car (created on first share). */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser("vehicle.view");
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const result = await createVehicleShareLink(id, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "unavailable"
            ? 409
            : 500;
    return jsonError(result.error.code, result.error.message, status);
  }

  // The link points at the site the salesperson is using, like invitation emails do.
  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    new URL(request.url).origin;
  const token = result.data!.token;
  const shared = await getSharedVehicle(token);
  return jsonOk({
    url: `${origin.replace(/\/$/, "")}/share/${token}`,
    missing: shared.status === "ok" ? missingShareDetails(shared.vehicle) : [],
  });
}
