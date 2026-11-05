import { jsonError, jsonOk, requireApiUser, planFeatureGate } from "@/lib/api/http";
import { deleteStaffDocument } from "@/lib/staff-documents/service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("document.view");
  if ("response" in auth) return auth.response;
  const offPlan = planFeatureGate(auth.context, "staff_documents");
  if (offPlan) return offPlan;
  const { id } = await params;
  const result = await deleteStaffDocument(id, auth.context);
  if (result.error) return jsonError(result.error.code, result.error.message, result.error.code === "not_found" ? 404 : 500);
  return jsonOk({ ok: true });
}
