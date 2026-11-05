import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { getAcquisitionMeta } from "@/lib/acquisitions/service";

export async function GET(request: Request) {
  const auth = await requireApiUser("acquisition.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? undefined;
  const makeId = url.searchParams.get("makeId") ?? undefined;

  const result = await getAcquisitionMeta(branchId, makeId);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, 400);
  }
  return jsonOk(result.data);
}
