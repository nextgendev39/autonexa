import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { saveDraft } from "@/lib/storefront/manage";

/** Saves the draft. Visitors see none of it until it's published. */
export async function PUT(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const { error } = await saveDraft(auth.context, await readJsonBody(request));
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
