import { jsonError, jsonOk } from "@/lib/api/http";
import { parseBody } from "@/lib/platform/api";
import { requirePlatformApi } from "@/lib/platform/session";
import { refundTransaction } from "@/lib/billing/service";
import { refundSchema } from "@/lib/validation/platform";

export async function POST(request: Request) {
  const auth = await requirePlatformApi("billing.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, refundSchema);
  if ("response" in body) return body.response;
  const { error } = await refundTransaction(body.data.transactionId, body.data.amount, body.data.reason ?? null);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
