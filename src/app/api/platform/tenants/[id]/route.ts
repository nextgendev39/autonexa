import { parseBody, respond } from "@/lib/platform/api";
import { updateDealership } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { updateDealershipSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("tenants.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, updateDealershipSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await updateDealership(id, body.data);
  return respond(error);
}
