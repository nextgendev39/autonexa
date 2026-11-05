import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { getAcquisitionHistory } from "@/lib/acquisitions/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser("acquisition.view");
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const result = await getAcquisitionHistory(id);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, 400);
  }
  return jsonOk(result.data);
}
