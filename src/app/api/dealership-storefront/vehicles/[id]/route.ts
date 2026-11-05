import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { setVehicleListing } from "@/lib/storefront/manage";
import { vehicleListingSchema } from "@/lib/validation/storefront";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const parsed = vehicleListingSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);
  const { id } = await params;
  const { error } = await setVehicleListing(id, parsed.data.published);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
