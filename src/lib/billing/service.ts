import "server-only";

import { billingConfigFromEnv, gatewayForCurrency, mayCheckOut, type BillingConfig, type GatewayName } from "@/lib/billing/config";
import { billingEmail, type OutboxKind } from "@/lib/billing/emails";
import { GatewayError, SignatureError, toMinorUnits, type Gateway, type GatewayEvent } from "@/lib/billing/gateway";
import { normalizeRazorpayEvent, razorpayGateway, verifyRazorpaySignature } from "@/lib/billing/razorpay";
import { normalizeStripeEvent, stripeGateway, verifyStripeSignature } from "@/lib/billing/stripe";
import { isMailerConfigured, sendEmail } from "@/lib/email/send-email";
import {
  applyPayment,
  attachSession,
  billingRecipients,
  claimWebhookEvent,
  expireCheckout,
  finishRefund,
  finishWebhookEvent,
  generateRenewalInvoices,
  markEmail,
  pendingEmails,
  prepareCheckout,
  prepareInvoicePayment,
  recordExternalRefund,
  recordFailure,
  type Prepared,
} from "@/lib/server/privileged/billing";
import { createClient } from "@/lib/supabase/server";
import type { UserContext } from "@/types/auth";

export type Failure = { code: string; message: string; status: number };
const fail = (code: string, message: string, status = 400): Failure => ({ code, message, status });

const config = () => billingConfigFromEnv();

function gatewayFrom(settings: BillingConfig, name: GatewayName): Gateway | null {
  if (name === "stripe") return settings.stripe ? stripeGateway(settings.stripe) : null;
  return settings.razorpay ? razorpayGateway(settings.razorpay) : null;
}

export function appOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3003").replace(/\/$/, "");
}

const PREPARE_ERRORS: Record<string, string> = {
  profile_required: "Add your billing details first.",
  plan_not_available: "That plan isn't available.",
  cycle_invalid: "Choose monthly or yearly.",
  price_not_set: "That plan isn't available in your currency yet. Contact AutoNexa.",
  tax_not_configured: "Billing isn't set up for your country yet. Contact AutoNexa.",
  seller_not_configured: "Billing isn't ready yet. Contact AutoNexa.",
  credit_exceeds_price: "Your unused time covers this change. Contact AutoNexa to arrange it.",
  schedule_downgrade: "A move to a smaller plan starts when your paid period ends. Schedule it instead.",
  invoice_not_payable: "That invoice can't be paid online.",
};

/**
 * Starts a payment and returns where to send the person. This changes no plan. The dealership and
 * prices all come from the server. The session's only job is to prove who's asking.
 */
export async function startCheckout(
  context: UserContext,
  request: { planId: string; cycle: string } | { invoiceId: string },
): Promise<{ redirectUrl: string | null; error: Failure | null }> {
  const settings = config();
  const supabase = await createClient();
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    supabase.from("tenants" as never).select("slug").maybeSingle(),
    supabase.from("tenant_billing_profiles" as never).select("currency, email").maybeSingle(),
  ]);
  const slug = (tenant as unknown as { slug: string } | null)?.slug ?? "";
  const billing = profile as unknown as { currency: string; email: string | null } | null;

  if (!mayCheckOut(settings, slug)) {
    return { redirectUrl: null, error: fail("billing_unavailable", "Online payment isn't available yet. Contact AutoNexa.", 403) };
  }
  if (!billing) return { redirectUrl: null, error: fail("profile_required", PREPARE_ERRORS.profile_required) };

  const gatewayName = gatewayForCurrency(settings, billing.currency);
  const gateway = gatewayName ? gatewayFrom(settings, gatewayName) : null;
  if (!gateway || !gatewayName) {
    return { redirectUrl: null, error: fail("gateway_unavailable", "Payments in your currency aren't available yet. Contact AutoNexa.", 503) };
  }

  const isTest = settings.mode === "test";
  const shared = { dealershipId: context.tenantId as string, gateway: gatewayName, isTest, actorId: context.userId };
  const prepared: Prepared =
    "invoiceId" in request
      ? await prepareInvoicePayment({ ...shared, invoiceId: request.invoiceId })
      : await prepareCheckout({ ...shared, planId: request.planId, cycle: request.cycle });
  if (prepared.error !== undefined) {
    return { redirectUrl: null, error: fail(prepared.error, PREPARE_ERRORS[prepared.error] ?? "That can't be done right now.", 409) };
  }

  const origin = appOrigin();
  const session = await gateway.createCheckout({
    checkoutId: prepared.checkoutId,
    invoiceNumber: prepared.invoiceNumber,
    description: prepared.description,
    amountMinor: toMinorUnits(prepared.amount),
    currency: prepared.currency,
    customerEmail: billing.email,
    // Only somewhere to come back to. Arriving there proves nothing, and it asks the gateway.
    successUrl: `${origin}/billing/return?checkout=${prepared.checkoutId}`,
    cancelUrl: `${origin}/billing?cancelled=1`,
  });
  await attachSession(prepared.checkoutId, session.sessionId);
  return { redirectUrl: session.redirectUrl, error: null };
}

/**
 * For the page someone returns to. Asks the gateway itself, and nothing from the browser counts, so
 * visiting this address by hand does nothing. Applying is idempotent with the webhook.
 */
export async function confirmCheckout(checkoutId: string) {
  const supabase = await createClient();
  // Through the session, so another dealership's checkout simply isn't found.
  const { data } = await supabase
    .from("billing_checkouts" as never)
    .select("id, gateway, status, provider_session_id")
    .eq("id", checkoutId)
    .maybeSingle();
  const checkout = data as unknown as {
    id: string;
    gateway: GatewayName;
    status: string;
    provider_session_id: string | null;
  } | null;
  if (!checkout) return null;
  if (checkout.status !== "open" && checkout.status !== "failed") return checkout.status;
  if (!checkout.provider_session_id) return checkout.status;

  const settings = config();
  const gateway = gatewayFrom(settings, checkout.gateway);
  if (!gateway) return checkout.status;
  const paid = await settleFromGateway(gateway, settings, checkout.provider_session_id, checkout.id);
  return paid ? "paid" : checkout.status;
}

/** Applies a payment only from what the gateway says, fetched by us. */
async function settleFromGateway(gateway: Gateway, settings: BillingConfig, sessionId: string, knownCheckoutId: string | null) {
  const state = await gateway.getSession(sessionId);
  const checkoutId = knownCheckoutId ?? state.checkoutId;
  if (!state.paid || !checkoutId || !state.paymentReference || state.amountMinor === null || !state.currency) {
    return false;
  }
  const outcome = await applyPayment({
    gateway: gateway.name,
    checkoutId,
    sessionId,
    paymentReference: state.paymentReference,
    amountMinor: state.amountMinor,
    currency: state.currency,
    // The gateway's own word on whether this was real money.
    isTest: state.live === null ? settings.mode === "test" : !state.live,
  });
  return outcome.result === "applied" || outcome.result === "duplicate";
}

async function processEvent(gateway: Gateway, settings: BillingConfig, event: GatewayEvent, isTest: boolean) {
  switch (event.type) {
    case "paid":
      if (!(await settleFromGateway(gateway, settings, event.sessionId, event.checkoutId))) {
        throw new GatewayError("The gateway doesn't show this as paid yet", 409);
      }
      return;
    case "failed":
      await recordFailure({
        gateway: gateway.name,
        checkoutId: event.checkoutId,
        reference: event.attemptReference,
        amountMinor: event.amountMinor,
        currency: event.currency,
        reason: event.reason,
        isTest,
      });
      return;
    case "expired":
      await expireCheckout(gateway.name, event.checkoutId);
      return;
    case "refunded":
      await recordExternalRefund({
        gateway: gateway.name,
        paymentReference: event.paymentReference,
        refundReference: event.refundReference,
        amountMinor: event.amountMinor,
        isTest,
      });
      return;
    case "ignored":
      return;
  }
}

export type WebhookResult = { status: number; body: string };

/**
 * Everything arriving at the webhook. Unsigned or stale requests stop at once. Anything after that
 * returns an error only when a retry could help, because the gateway retries on errors.
 */
export async function handleWebhook(name: string, rawBody: string, headers: Headers): Promise<WebhookResult> {
  const settings = config();
  if (settings.mode === "off" || (name !== "stripe" && name !== "razorpay")) {
    return { status: 404, body: "Not found" };
  }
  const gateway = gatewayFrom(settings, name);
  if (!gateway) return { status: 404, body: "Not found" };

  let event: GatewayEvent;
  const isTest = settings.mode === "test";
  try {
    if (name === "stripe") {
      verifyStripeSignature(rawBody, headers.get("stripe-signature"), settings.stripe!.webhookSecret);
      const normalized = normalizeStripeEvent(JSON.parse(rawBody));
      // A signed event from the other mode is genuine but isn't for this environment.
      if (normalized.live === isTest) return { status: 200, body: "Wrong mode: ignored" };
      event = normalized;
    } else {
      verifyRazorpaySignature(rawBody, headers.get("x-razorpay-signature"), settings.razorpay!.webhookSecret);
      event = normalizeRazorpayEvent(JSON.parse(rawBody), headers.get("x-razorpay-event-id"));
    }
  } catch (error) {
    if (error instanceof SignatureError || error instanceof SyntaxError) {
      console.warn(`[billing] rejected a ${name} webhook:`, (error as Error).message);
      return { status: 400, body: "Invalid signature" };
    }
    throw error;
  }

  if (!(await claimWebhookEvent(name, event.id, event.rawType, isTest))) {
    return { status: 200, body: "Already processed" };
  }
  if (event.type === "ignored") {
    await finishWebhookEvent(name, event.id, "ignored");
    return { status: 200, body: "Ignored" };
  }
  try {
    await processEvent(gateway, settings, event, isTest);
    await finishWebhookEvent(name, event.id, "processed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[billing] could not process ${name} event ${event.id}:`, message);
    await finishWebhookEvent(name, event.id, "failed", message);
    return { status: 500, body: "Try again" };
  }
  await sendPendingBillingEmails().catch((error) => console.error("[billing] could not send emails", error));
  return { status: 200, body: "OK" };
}

/** A refund goes on record as pending first, so a crash after the call leaves a trace. */
export async function refundTransaction(transactionId: string, amount: number, reason: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "platform_prepare_refund" as never,
    { p_transaction_id: transactionId, p_amount: amount, p_reason: reason } as never,
  );
  if (error) {
    if (error.code === "42501") return { error: fail("forbidden", "You do not have permission to do this.", 403) };
    if (error.code === "22023") return { error: fail("invalid", error.message) };
    return { error: fail("db_error", error.message, 500) };
  }
  const refund = data as unknown as {
    refundId: string;
    gateway: GatewayName | null;
    paymentReference: string | null;
    amount: number;
  };

  // A payment recorded by hand has no gateway: this only records that money went back.
  if (!refund.gateway || !refund.paymentReference) {
    await finishRefund(refund.refundId, true, null);
    return { error: null };
  }

  const gateway = gatewayFrom(config(), refund.gateway);
  if (!gateway) {
    await finishRefund(refund.refundId, false, null, "gateway_unavailable");
    return { error: fail("gateway_unavailable", "That gateway isn't configured here.", 503) };
  }
  try {
    const { reference } = await gateway.refund({
      paymentReference: refund.paymentReference,
      amountMinor: toMinorUnits(refund.amount),
      // Our row's ID, so retrying this can't refund twice.
      idempotencyKey: refund.refundId,
    });
    await finishRefund(refund.refundId, true, reference);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Refund failed";
    // Only a clear refusal counts as failed. After a timeout the money may have moved, so the row
    // stays pending for a person to check rather than freeing the amount to be refunded again.
    if (cause instanceof GatewayError && cause.status < 500) {
      await finishRefund(refund.refundId, false, null, message);
      return { error: fail("refund_failed", message) };
    }
    console.error("[billing] refund outcome unknown", refund.refundId, message);
    return { error: fail("refund_unknown", "We couldn't confirm that refund. Check the gateway before trying again.", 502) };
  }
  await sendPendingBillingEmails().catch((error) => console.error("[billing] could not send emails", error));
  return { error: null };
}

/** Sends what's queued. Marks each as it goes, so a crash part-way can't resend what's gone. */
export async function sendPendingBillingEmails() {
  if (!isMailerConfigured()) return;
  const billingUrl = `${appOrigin()}/billing`;
  for (const row of await pendingEmails()) {
    try {
      const recipients = await billingRecipients(row.tenant_id);
      const message = billingEmail(row.kind as OutboxKind, row.data, billingUrl);
      await Promise.all(recipients.map((to) => sendEmail({ to, ...message })));
      await markEmail(row.id, row.attempts + 1, true);
    } catch (error) {
      console.error("[billing] email failed", row.id, error);
      await markEmail(row.id, row.attempts + 1, false);
    }
  }
}

/** Part of the hourly sweep: invoices for what's coming up, in the mode this environment is in. */
export async function runBillingSweep() {
  const settings = config();
  if (settings.mode === "off") return;
  await generateRenewalInvoices(settings.mode === "test");
  await sendPendingBillingEmails();
}
