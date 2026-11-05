import { createHmac, timingSafeEqual } from "node:crypto";

import type { GatewayName } from "@/lib/billing/config";

/**
 * What the rest of the app knows about a payment provider. Events are cut down to references and
 * amounts here, so card details never get further than this file, even when a provider sends them.
 */
export type CheckoutRequest = {
  checkoutId: string;
  invoiceNumber: string;
  description: string;
  amountMinor: number;
  currency: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = { sessionId: string; redirectUrl: string };

/** What the provider itself says happened, fetched server to server. */
export type SessionState = {
  sessionId: string;
  checkoutId: string | null;
  paid: boolean;
  expired: boolean;
  paymentReference: string | null;
  amountMinor: number | null;
  currency: string | null;
  live: boolean | null;
};

export type GatewayEvent = {
  id: string;
  rawType: string;
} & (
  | { type: "paid"; sessionId: string; checkoutId: string | null }
  | { type: "failed"; checkoutId: string; attemptReference: string; amountMinor: number | null; currency: string | null; reason: string }
  | { type: "expired"; checkoutId: string }
  | { type: "refunded"; paymentReference: string; refundReference: string; amountMinor: number }
  | { type: "ignored" }
);

export type Gateway = {
  name: GatewayName;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getSession(sessionId: string): Promise<SessionState>;
  refund(input: { paymentReference: string; amountMinor: number; idempotencyKey: string }): Promise<{ reference: string }>;
};

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export class SignatureError extends Error {
  constructor(reason: string) {
    super(`Webhook signature rejected: ${reason}`);
    this.name = "SignatureError";
  }
}

/** Constant time, so a forged signature can't be worked out byte by byte. */
export function signaturesMatch(expectedHex: string, givenHex: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const given = Buffer.from(givenHex, "hex");
  return expected.length > 0 && expected.length === given.length && timingSafeEqual(expected, given);
}

export const hmacSha256Hex = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload, "utf8").digest("hex");

/** AED and INR both have two decimal places. Worked out from text, so floats can't shift a cent. */
export function toMinorUnits(amount: number | string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new GatewayError("Invalid amount", 400);
  return Math.round(value * 100);
}
