import { parseBody, respond } from "@/lib/platform/api";
import { addDomain } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { domainSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("tenants.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, domainSchema);
  if ("response" in body) return body.response;
  const values = body.data;
  const { id } = await params;
  const { error } = await addDomain(id, values.domain, values.isPrimary);
  return respond(error);
}
