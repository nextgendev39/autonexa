import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { setVehicleDetails, setVehicleListing } from "@/lib/storefront/manage";
import { vehicleListingSchema } from "@/lib/validation/storefront";

type RouteContext = { params: Promise<{ id: string }> };

/** Show on storefront, and what the listing says. The database checks branch permission for both. */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const parsed = vehicleListingSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);
  const { id } = await params;
  const { published, description, features } = parsed.data;

  if (description !== undefined || features !== undefined) {
    const { error } = await setVehicleDetails(id, description ?? null, features ?? []);
    if (error) return jsonError(error.code, error.message, error.status);
  }
  if (published !== undefined) {
    const { error } = await setVehicleListing(id, published);
    if (error) return jsonError(error.code, error.message, error.status);
  }
  return jsonOk({ ok: true });
}
