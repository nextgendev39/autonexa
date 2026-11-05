import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { listCatalogYears } from "@/lib/vehicles/catalog";

export async function GET(request: Request) {
  const auth = await requireApiUser("vehicle.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const modelId = url.searchParams.get("modelId");
  if (!modelId) return jsonError("validation", "modelId is required.", 400);

  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const result = await listCatalogYears(modelId, { includeInactive });
  if (result.error) return jsonError(result.error.code, result.error.message, 400);
  return jsonOk(result.data);
}
