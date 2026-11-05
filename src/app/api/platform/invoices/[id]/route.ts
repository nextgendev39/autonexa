import { parseBody, respond } from "@/lib/platform/api";
import { setInvoiceStatus } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { invoiceStatusSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("billing.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, invoiceStatusSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await setInvoiceStatus(id, body.data.status);
  return respond(error);
}
