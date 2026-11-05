import "server-only";

import { createPrivilegedClient } from "./client";
import { tenantClient } from "./index";
import { memberAuthDetails } from "./members";

/** Service-role steps for billing. Webhooks have no session, and these are not for clients to call. */
const rpc = (name: string, args?: Record<string, unknown>) =>
  createPrivilegedClient().rpc(name as never, args as never);

export type PreparedCheckout = {
  checkoutId: string;
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  amount: number | string;
  currency: string;
  kind: string;
  error?: undefined;
};
export type Prepared = PreparedCheckout | { error: string };

export async function prepareCheckout(input: {
  dealershipId: string;
  planId: string;
  cycle: string;
  gateway: string;
  isTest: boolean;
  actorId: string;
}) {
  const { data, error } = await rpc("billing_prepare_checkout", {
    p_tenant_id: input.dealershipId,
    p_plan_id: input.planId,
    p_cycle: input.cycle,
    p_gateway: input.gateway,
    p_is_test: input.isTest,
    p_actor: input.actorId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Prepared;
}

export async function prepareInvoicePayment(input: {
  dealershipId: string;
  invoiceId: string;
  gateway: string;
  isTest: boolean;
  actorId: string;
}) {
  const { data, error } = await rpc("billing_pay_invoice", {
    p_tenant_id: input.dealershipId,
    p_invoice_id: input.invoiceId,
    p_gateway: input.gateway,
    p_is_test: input.isTest,
    p_actor: input.actorId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Prepared;
}

export async function attachSession(checkoutId: string, sessionId: string) {
  const { error } = await rpc("billing_attach_session", { p_checkout_id: checkoutId, p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

export async function applyPayment(input: {
  gateway: string;
  checkoutId: string;
  sessionId: string;
  paymentReference: string;
  amountMinor: number;
  currency: string;
  isTest: boolean;
}) {
  const { data, error } = await rpc("billing_apply_payment", {
    p_gateway: input.gateway,
    p_checkout_id: input.checkoutId,
    p_session_id: input.sessionId,
    p_payment_reference: input.paymentReference,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_is_test: input.isTest,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { result: string; reason?: string };
}

export async function recordFailure(input: {
  gateway: string;
  checkoutId: string;
  reference: string;
  amountMinor: number | null;
  currency: string | null;
  reason: string;
  isTest: boolean;
}) {
  const { error } = await rpc("billing_record_failure", {
    p_gateway: input.gateway,
    p_checkout_id: input.checkoutId,
    p_payment_reference: input.reference,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_reason: input.reason,
    p_is_test: input.isTest,
  });
  if (error) throw new Error(error.message);
}

export async function expireCheckout(gateway: string, checkoutId: string) {
  const { error } = await rpc("billing_expire_checkout", { p_gateway: gateway, p_checkout_id: checkoutId });
  if (error) throw new Error(error.message);
}

export async function finishRefund(refundId: string, succeeded: boolean, reference: string | null, reason?: string) {
  const { error } = await rpc("billing_finish_refund", {
    p_refund_id: refundId,
    p_succeeded: succeeded,
    p_reference: reference,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function recordExternalRefund(input: {
  gateway: string;
  paymentReference: string;
  refundReference: string;
  amountMinor: number;
  isTest: boolean;
}) {
  const { error } = await rpc("billing_record_external_refund", {
    p_gateway: input.gateway,
    p_payment_reference: input.paymentReference,
    p_refund_reference: input.refundReference,
    p_amount_minor: input.amountMinor,
    p_is_test: input.isTest,
  });
  if (error) throw new Error(error.message);
}

/**
 * Claims a webhook event. A false result means it was already dealt with. An event that failed part-way
 * can be claimed again, since it was never marked processed, so the gateway's retry still works.
 */
export async function claimWebhookEvent(gateway: string, eventId: string, eventType: string, isTest: boolean) {
  const client = createPrivilegedClient();
  const { data } = await client
    .from("billing_webhook_events" as never)
    .select("status, attempts")
    .eq("gateway", gateway)
    .eq("event_id", eventId)
    .maybeSingle();
  const seen = data as unknown as { status: string; attempts: number } | null;
  if (seen) {
    if (seen.status === "processed" || seen.status === "ignored") return false;
    await client
      .from("billing_webhook_events" as never)
      .update({ attempts: seen.attempts + 1 } as never)
      .eq("gateway", gateway)
      .eq("event_id", eventId);
    return true;
  }
  const { error } = await client
    .from("billing_webhook_events" as never)
    .insert({ gateway, event_id: eventId, event_type: eventType, is_test: isTest } as never);
  // Two deliveries at once: the unique key lets one through, and the other's retry finds it done.
  if (error?.code === "23505") return false;
  if (error) throw new Error(error.message);
  return true;
}

export async function finishWebhookEvent(gateway: string, eventId: string, status: "processed" | "failed" | "ignored", message?: string) {
  await createPrivilegedClient()
    .from("billing_webhook_events" as never)
    .update({ status, error: message?.slice(0, 500) ?? null, processed_at: new Date().toISOString() } as never)
    .eq("gateway", gateway)
    .eq("event_id", eventId);
}

export async function generateRenewalInvoices(isTest: boolean) {
  const { error } = await rpc("billing_generate_renewal_invoices", { p_is_test: isTest });
  if (error) throw new Error(error.message);
}

export async function pendingEmails(limit = 25) {
  const { data } = await createPrivilegedClient()
    .from("billing_email_outbox" as never)
    .select("id, tenant_id, kind, invoice_id, data, attempts")
    .is("sent_at", null)
    .lt("attempts", 5)
    .order("created_at")
    .limit(limit);
  return (data ?? []) as unknown as {
    id: string;
    tenant_id: string;
    kind: string;
    invoice_id: string | null;
    data: Record<string, unknown>;
    attempts: number;
  }[];
}

export async function markEmail(id: string, attempts: number, sent: boolean) {
  await createPrivilegedClient()
    .from("billing_email_outbox" as never)
    .update({ attempts, ...(sent ? { sent_at: new Date().toISOString() } : {}) } as never)
    .eq("id", id);
}

/** Everyone a dealership's billing email should reach. */
export async function billingRecipients(dealershipId: string) {
  const client = tenantClient({ tenantId: dealershipId });
  const [{ data: ids }, members, { data: profile }] = await Promise.all([
    client.rpc("active_super_admin_ids" as never, { p_tenant_id: dealershipId } as never),
    memberAuthDetails(client),
    createPrivilegedClient()
      .from("tenant_billing_profiles" as never)
      .select("email")
      .eq("tenant_id", dealershipId)
      .maybeSingle(),
  ]);
  const admins = new Set((ids ?? []) as unknown as string[]);
  const emails = members.filter((m) => admins.has(m.user_id) && m.email).map((m) => m.email as string);
  const billing = (profile as unknown as { email: string | null } | null)?.email;
  return [...new Set([...(billing ? [billing] : []), ...emails])];
}

/** The few public fields of plans on offer. Dealerships can't read the plans table themselves. */
export async function publicPlanCatalog() {
  const client = createPrivilegedClient();
  const [{ data: plans }, { data: prices }] = await Promise.all([
    client
      .from("plans" as never)
      .select("id, name, description, currency, price_monthly, price_yearly, is_active, sort_order")
      .order("sort_order"),
    client.from("plan_prices" as never).select("plan_id, currency, billing_cycle, amount"),
  ]);
  return {
    plans: (plans ?? []) as unknown as {
      id: string;
      name: string;
      description: string | null;
      currency: string;
      price_monthly: number;
      price_yearly: number;
      is_active: boolean;
    }[],
    prices: (prices ?? []) as unknown as { plan_id: string; currency: string; billing_cycle: string; amount: number }[],
  };
}
