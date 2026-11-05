import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { getVehicleCostSummary, getVehicleDocuments } from "@/lib/vehicles/documents";

function statusForCode(code: string) {
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  return 400;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const [documents, costs] = await Promise.all([
    getVehicleDocuments(id, auth.context),
    getVehicleCostSummary(id, auth.context),
  ]);

  if (documents.error) {
    return jsonError(
      documents.error.code,
      documents.error.message,
      statusForCode(documents.error.code),
    );
  }

  return jsonOk({
    documents: documents.data,
    costs: costs.error ? null : costs.data,
  });
}
