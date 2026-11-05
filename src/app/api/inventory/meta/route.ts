import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { listBranches, listLocations, listMakes, listModels } from "@/lib/vehicles/service";

export async function GET(request: Request) {
  const auth = await requireApiUser("vehicle.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? undefined;
  const makeId = url.searchParams.get("makeId") ?? undefined;

  const [branches, locations, makes, models] = await Promise.all([
    listBranches(),
    listLocations(branchId),
    listMakes(),
    listModels(makeId),
  ]);

  for (const result of [branches, locations, makes, models]) {
    if (result.error) {
      return jsonError(result.error.code, result.error.message, 400);
    }
  }

  return jsonOk({
    branches: branches.data,
    locations: locations.data,
    makes: makes.data,
    models: models.data,
  });
}
