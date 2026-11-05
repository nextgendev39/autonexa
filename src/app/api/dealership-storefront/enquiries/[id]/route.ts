import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { setEnquiryStatus } from "@/lib/storefront/manage";
import { enquiryStatusSchema } from "@/lib/validation/storefront";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireApiUser("customer.edit");
  if ("response" in auth) return auth.response;
  const parsed = enquiryStatusSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);
  const { id } = await params;
  const { error } = await setEnquiryStatus(id, parsed.data.status, auth.context);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
