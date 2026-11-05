import { parseBody, respond } from "@/lib/platform/api";
import { createInvoice } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { createInvoiceSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("billing.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, createInvoiceSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await createInvoice(
    id,
    body.data,
    auth.context.userId,
  );
  return respond(error);
}
