import { parseBody, respond } from "@/lib/platform/api";
import { updatePlan } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { updatePlanSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("plans.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, updatePlanSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await updatePlan(id, body.data);
  return respond(error);
}
