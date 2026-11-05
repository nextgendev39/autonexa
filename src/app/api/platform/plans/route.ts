import { parseBody, respond } from "@/lib/platform/api";
import { createPlan } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { createPlanSchema } from "@/lib/validation/platform";

export async function POST(request: Request) {
  const auth = await requirePlatformApi("plans.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, createPlanSchema);
  if ("response" in body) return body.response;
  const { error } = await createPlan(body.data);
  return respond(error);
}
