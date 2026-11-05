import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { checkDomain, removeDomain } from "@/lib/storefront/manage";

type RouteContext = { params: Promise<{ id: string }> };

/** Runs the DNS and certificate checks now. */
export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const { result, error } = await checkDomain(id);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk(result);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const { error } = await removeDomain(id);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
