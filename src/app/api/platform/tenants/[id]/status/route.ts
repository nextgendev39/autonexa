import { deliverAfterResponse, parseBody, respond } from "@/lib/platform/api";
import { emailDealershipStatus, setDealershipStatus } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { dealershipStatusSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("tenants.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, dealershipStatusSchema);
  if ("response" in body) return body.response;
  const values = body.data;
  const { id } = await params;
  const { error } = await setDealershipStatus(id, values.status, values.reason);
  if (error) return respond(error);
  deliverAfterResponse();
  const emailed = await emailDealershipStatus(id, values.status);
  return respond(null, { emailed });
}
