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

/** Razorpay's API, called directly. Hosted payment links, so card details only ever go to Razorpay. */
type Dict = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" ? value : null);
const entity = (payload: Dict, name: string) =>
  (((payload.payload as Dict | undefined)?.[name] as Dict | undefined)?.entity ?? {}) as Dict;

export function verifyRazorpaySignature(rawBody: string, header: string | null, secret: string) {
  if (!header) throw new SignatureError("missing header");
  if (!signaturesMatch(hmacSha256Hex(secret, rawBody), header)) throw new SignatureError("no match");
}

/** Razorpay's event ID is in a header. Its body carries no mode, which comes from which secret was used. */
export function normalizeRazorpayEvent(payload: Dict, eventIdHeader: string | null): GatewayEvent {
  const rawType = str(payload.event) ?? "";
  if (!eventIdHeader) throw new SignatureError("event has no id");
  const base = { id: eventIdHeader, rawType };

  switch (rawType) {
    case "payment_link.paid": {
      const link = entity(payload, "payment_link");
      const sessionId = str(link.id);
      if (!sessionId) return { ...base, type: "ignored" };
      return { ...base, type: "paid", sessionId, checkoutId: str(link.reference_id) };
    }
    case "payment_link.expired":
    case "payment_link.cancelled": {
      const checkoutId = str(entity(payload, "payment_link").reference_id);
      return checkoutId ? { ...base, type: "expired", checkoutId } : { ...base, type: "ignored" };
    }
    case "payment.failed": {
      const payment = entity(payload, "payment");
      const checkoutId = str((payment.notes as Dict | undefined)?.checkout_id);
      if (!checkoutId) return { ...base, type: "ignored" };
      return {
        ...base,
        type: "failed",
        checkoutId,
        attemptReference: str(payment.id) ?? eventIdHeader,
        amountMinor: num(payment.amount),
        currency: str(payment.currency),
        reason: str(payment.error_code) ?? "payment_failed",
      };
    }
    case "refund.processed": {
      const refund = entity(payload, "refund");
      const paymentReference = str(refund.payment_id);
      const refundReference = str(refund.id);
      if (!paymentReference || !refundReference) return { ...base, type: "ignored" };
      return { ...base, type: "refunded", paymentReference, refundReference, amountMinor: num(refund.amount) ?? 0 };
    }
    default:
      return { ...base, type: "ignored" };
  }
}

export function razorpayGateway(config: NonNullable<BillingConfig["razorpay"]>, fetcher: typeof fetch = fetch): Gateway {
  const authorization = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
  const call = async (path: string, init: { body?: Dict; idempotencyKey?: string } = {}) => {
    const response = await fetcher(`${config.apiBase}${path}`, {
      method: init.body ? "POST" : "GET",
      headers: {
        Authorization: authorization,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.idempotencyKey ? { "X-Razorpay-Idempotency": init.idempotencyKey } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => ({}))) as Dict;
    if (!response.ok) {
      throw new GatewayError(str((json.error as Dict | undefined)?.description) ?? "Razorpay request failed", response.status);
    }
    return json;
  };

  return {
    name: "razorpay",
    async createCheckout(request) {
      const link = await call("/v1/payment_links", {
        body: {
          amount: request.amountMinor,
          currency: request.currency,
          accept_partial: false,
          reference_id: request.checkoutId,
          description: `${request.description} (${request.invoiceNumber})`.slice(0, 2048),
          callback_url: request.successUrl,
          callback_method: "get",
          notes: { checkout_id: request.checkoutId },
          ...(request.customerEmail ? { customer: { email: request.customerEmail } } : {}),
        },
      });
      const sessionId = str(link.id);
      const redirectUrl = str(link.short_url);
      if (!sessionId || !redirectUrl) throw new GatewayError("Razorpay returned no link", 502);
      return { sessionId, redirectUrl };
    },
    async getSession(sessionId): Promise<SessionState> {
      const link = await call(`/v1/payment_links/${encodeURIComponent(sessionId)}`);
      const payments = (link.payments ?? []) as Dict[];
      const captured = payments.find((payment) => payment.status === "captured") ?? payments[0];
      return {
        sessionId,
        checkoutId: str(link.reference_id),
        paid: link.status === "paid",
        expired: link.status === "expired" || link.status === "cancelled",
        paymentReference: str(captured?.payment_id),
        amountMinor: num(link.amount_paid),
        currency: str(link.currency),
        // The key's own prefix decides this: Razorpay's responses don't carry a mode.
        live: config.keyId.startsWith("rzp_live_"),
      };
    },
    async refund({ paymentReference, amountMinor, idempotencyKey }) {
      const refund = await call(`/v1/payments/${encodeURIComponent(paymentReference)}/refund`, {
        idempotencyKey,
        body: { amount: amountMinor, speed: "normal" },
      });
      const reference = str(refund.id);
      if (!reference) throw new GatewayError("Razorpay returned no refund", 502);
      return { reference };
    },
  };
}
