import { respond } from "@/lib/platform/api";
import { removeDomain } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";

type RouteContext = { params: Promise<{ id: string; domainId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("tenants.manage");
  if ("response" in auth) return auth.response;
  const { id, domainId } = await params;
  const { error } = await removeDomain(id, domainId);
  return respond(error);
}
