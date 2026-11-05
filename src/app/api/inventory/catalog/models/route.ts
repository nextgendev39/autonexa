import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { listCatalogModels } from "@/lib/vehicles/catalog";

export async function GET(request: Request) {
  const auth = await requireApiUser("vehicle.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const makeId = url.searchParams.get("makeId");
  if (!makeId) return jsonError("validation", "makeId is required.", 400);

  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const q = url.searchParams.get("q") ?? undefined;
  const result = await listCatalogModels(makeId, { includeInactive, q });
  if (result.error) return jsonError(result.error.code, result.error.message, 400);
  return jsonOk(result.data);
}
