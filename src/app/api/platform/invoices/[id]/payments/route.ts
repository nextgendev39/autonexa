import { parseBody, respond } from "@/lib/platform/api";
import { recordPayment } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { paymentSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

/** Records money received by other means. No payment provider is involved. */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("billing.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, paymentSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await recordPayment(id, body.data);
  return respond(error);
}
