import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { GatewayError } from "@/lib/billing/gateway";
import { startCheckout } from "@/lib/billing/service";
import { checkoutSchema } from "@/lib/validation/billing";

/** Starts a payment. This changes no plan: only the gateway's confirmation does that. */
export async function POST(request: Request) {
  const auth = await requireApiUser("billing.manage");
  if ("response" in auth) return auth.response;
  const parsed = checkoutSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Choose a plan and a billing cycle.", 400);
  try {
    const { redirectUrl, error } = await startCheckout(auth.context, parsed.data);
    if (error) return jsonError(error.code, error.message, error.status);
    return jsonOk({ redirectUrl });
  } catch (cause) {
    if (cause instanceof GatewayError) {
      console.error("[billing] gateway refused a checkout", cause.message);
      return jsonError("gateway_error", "The payment provider couldn't start this. Try again shortly.", 400);
    }
    throw cause;
  }
}
