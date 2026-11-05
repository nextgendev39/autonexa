import type { BillingConfig } from "@/lib/billing/config";
import {
  GatewayError,
  SignatureError,
  hmacSha256Hex,
  signaturesMatch,
  type Gateway,
  type GatewayEvent,
  type SessionState,
} from "@/lib/billing/gateway";

/** Stripe's API, called directly. Hosted Checkout, so card details only ever go to Stripe. */
const TOLERANCE_SECONDS = 300;

type Dict = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" ? value : null);

/** Rejects a bad signature, and a good one that's old, so a captured request can't be replayed. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Date.now() / 1000) {
  if (!header) throw new SignatureError("missing header");
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new SignatureError("malformed header");
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) throw new SignatureError("too old");
  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((signature) => signaturesMatch(expected, signature))) throw new SignatureError("no match");
}

/** Cut down to what we act on. Nothing else in the payload goes any further. */
export function normalizeStripeEvent(payload: Dict): GatewayEvent & { live: boolean } {
  const id = str(payload.id);
  const rawType = str(payload.type) ?? "";
  if (!id) throw new SignatureError("event has no id");
  const object = ((payload.data as Dict | undefined)?.object ?? {}) as Dict;
  const metadata = (object.metadata ?? {}) as Dict;
  const live = payload.livemode === true;
  const base = { id, rawType, live };

  switch (rawType) {
    case "checkout.session.completed":
      // Some methods settle later. A completed session that isn't paid yet isn't a payment.
      if (object.payment_status !== "paid") return { ...base, type: "ignored" };
      return { ...base, type: "paid", sessionId: str(object.id) ?? "", checkoutId: str(object.client_reference_id) };
    case "checkout.session.async_payment_succeeded":
      return { ...base, type: "paid", sessionId: str(object.id) ?? "", checkoutId: str(object.client_reference_id) };
    case "checkout.session.async_payment_failed": {
      const checkoutId = str(object.client_reference_id);
      if (!checkoutId) return { ...base, type: "ignored" };
      return {
        ...base,
        type: "failed",
        checkoutId,
        attemptReference: id,
        amountMinor: num(object.amount_total),
        currency: str(object.currency),
        reason: "payment_failed",
      };
    }
    case "checkout.session.expired": {
      const checkoutId = str(object.client_reference_id);
      return checkoutId ? { ...base, type: "expired", checkoutId } : { ...base, type: "ignored" };
    }
    case "payment_intent.payment_failed": {
      const checkoutId = str(metadata.checkout_id);
      if (!checkoutId) return { ...base, type: "ignored" };
      const lastError = (object.last_payment_error ?? {}) as Dict;
      return {
        ...base,
        type: "failed",
        checkoutId,
        // Per attempt: someone can fail several times on one payment intent.
        attemptReference: id,
        amountMinor: num(object.amount),
        currency: str(object.currency),
        reason: str(lastError.code) ?? str(lastError.decline_code) ?? "payment_failed",
      };
    }
    case "charge.refunded": {
      const refunds = ((object.refunds as Dict | undefined)?.data ?? []) as Dict[];
      const latest = refunds[0];
      const paymentReference = str(object.payment_intent);
      if (!paymentReference || !latest) return { ...base, type: "ignored" };
      return {
        ...base,
        type: "refunded",
        paymentReference,
        refundReference: str(latest.id) ?? id,
        amountMinor: num(latest.amount) ?? 0,
      };
    }
    default:
      return { ...base, type: "ignored" };
  }
}

export function stripeGateway(config: NonNullable<BillingConfig["stripe"]>, fetcher: typeof fetch = fetch): Gateway {
  const call = async (path: string, init: { form?: Record<string, string>; idempotencyKey?: string } = {}) => {
    const response = await fetcher(`${config.apiBase}${path}`, {
      method: init.form ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.form ? new URLSearchParams(init.form).toString() : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => ({}))) as Dict;
    if (!response.ok) {
      throw new GatewayError(str((json.error as Dict | undefined)?.message) ?? "Stripe request failed", response.status);
    }
    return json;
  };

  return {
    name: "stripe",
    async createCheckout(request) {
      const session = await call("/v1/checkout/sessions", {
        // A double click makes one session.
        idempotencyKey: `checkout-${request.checkoutId}`,
        form: {
          mode: "payment",
          client_reference_id: request.checkoutId,
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": request.currency.toLowerCase(),
          "line_items[0][price_data][unit_amount]": String(request.amountMinor),
          "line_items[0][price_data][product_data][name]": `${request.description} (${request.invoiceNumber})`,
          "payment_intent_data[metadata][checkout_id]": request.checkoutId,
          "metadata[checkout_id]": request.checkoutId,
          ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
        },
      });
      const sessionId = str(session.id);
      const redirectUrl = str(session.url);
      if (!sessionId || !redirectUrl) throw new GatewayError("Stripe returned no session", 502);
      return { sessionId, redirectUrl };
    },
    async getSession(sessionId): Promise<SessionState> {
      const session = await call(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
      return {
        sessionId,
        checkoutId: str(session.client_reference_id),
        paid: session.payment_status === "paid",
        expired: session.status === "expired",
        paymentReference: str(session.payment_intent),
        amountMinor: num(session.amount_total),
        currency: str(session.currency),
        live: session.livemode === true,
      };
    },
    async refund({ paymentReference, amountMinor, idempotencyKey }) {
      const refund = await call("/v1/refunds", {
        idempotencyKey,
        form: { payment_intent: paymentReference, amount: String(amountMinor) },
      });
      const reference = str(refund.id);
      if (!reference) throw new GatewayError("Stripe returned no refund", 502);
      if (refund.status === "failed" || refund.status === "canceled") {
        throw new GatewayError(`Refund ${refund.status}`, 402);
      }
      return { reference };
    },
  };
}
