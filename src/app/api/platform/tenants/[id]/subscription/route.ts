import { deliverAfterResponse, parseBody, respond } from "@/lib/platform/api";
import { assignPlan, cancelSubscription, renewSubscription } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { subscriptionActionSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("subscriptions.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, subscriptionActionSchema);
  if ("response" in body) return body.response;
  const values = body.data;
  const { id } = await params;

  const { error } =
    values.action === "assign"
      ? await assignPlan(id, values)
      : values.action === "renew"
        ? await renewSubscription(id, values.subscriptionId, values.periodEnd)
        : await cancelSubscription(id, values.subscriptionId, values.reason);
  if (!error) deliverAfterResponse();
  return respond(error);
}
