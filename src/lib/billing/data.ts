import "server-only";

import { billingConfigFromEnv, mayCheckOut } from "@/lib/billing/config";
import type { InvoiceDocument, InvoiceTransaction } from "@/lib/billing/invoice-html";
import { createClient } from "@/lib/supabase/server";

/** What a dealership sees of its own billing. All through its session, so RLS applies. */
export type BillingProfile = {
  legal_name: string;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  country: string;
  currency: string;
  email: string | null;
};
export type OwnInvoice = {
  id: string;
  invoice_number: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  issued_at: string;
  due_at: string | null;
  is_test: boolean;
};
export type OwnTransaction = {
  id: string;
  invoice_id: string;
  kind: string;
  status: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  failure_reason: string | null;
  occurred_at: string;
};
export type PlanOption = {
  id: string;
  name: string;
  description: string | null;
  prices: { monthly: number | null; yearly: number | null };
};

export async function getBillingProfile() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_billing_profiles" as never)
    .select("legal_name, tax_id, address, city, country, currency, email")
    .maybeSingle();
  return data as unknown as BillingProfile | null;
}

export async function saveBillingProfile(
  dealershipId: string,
  actorId: string,
  values: { legalName: string; taxId?: string | null; address?: string | null; city?: string | null; country: string; currency: string; email?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_billing_profiles" as never).upsert(
    {
      tenant_id: dealershipId,
      legal_name: values.legalName,
      tax_id: values.taxId || null,
      address: values.address || null,
      city: values.city || null,
      country: values.country,
      currency: values.currency,
      email: values.email || null,
      updated_by: actorId,
    } as never,
    { onConflict: "tenant_id" },
  );
  return error;
}

export async function listOwnBilling() {
  const supabase = await createClient();
  const [{ data: invoices }, { data: transactions }] = await Promise.all([
    supabase
      .from("subscription_invoices" as never)
      .select("id, invoice_number, kind, amount, currency, status, description, issued_at, due_at, is_test")
      .order("issued_at", { ascending: false })
      .limit(100),
    supabase
      .from("subscription_transactions" as never)
      .select("id, invoice_id, kind, status, amount, currency, method, reference, failure_reason, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200),
  ]);
  return {
    invoices: ((invoices ?? []) as unknown as OwnInvoice[]).map((row) => ({ ...row, amount: Number(row.amount) })),
    transactions: ((transactions ?? []) as unknown as OwnTransaction[]).map((row) => ({ ...row, amount: Number(row.amount) })),
  };
}

export async function getOwnSubscription() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_subscriptions" as never)
    .select("id, status, billing_cycle, current_period_end, cancel_at_period_end, plan_id, scheduled_plan_id, scheduled_cycle")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as {
    id: string;
    status: string;
    billing_cycle: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    plan_id: string;
    scheduled_plan_id: string | null;
    scheduled_cycle: string | null;
  } | null;
}

/** Whether this dealership can pay online here at all, without saying why not. */
export async function canCheckOutHere() {
  const supabase = await createClient();
  const { data } = await supabase.from("tenants" as never).select("slug").maybeSingle();
  return mayCheckOut(billingConfigFromEnv(), (data as unknown as { slug: string } | null)?.slug ?? "");
}

/** RLS decides who can read it: this dealership's staff, or platform staff with billing access. */
export async function getInvoiceDocument(id: string) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: transactions }] = await Promise.all([
    supabase
      .from("subscription_invoices" as never)
      .select(
        "invoice_number, status, kind, description, currency, amount, subtotal, credit_amount, tax_rate, tax_label, tax_amount, issued_at, due_at, paid_at, is_test, billing_snapshot",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("subscription_transactions" as never)
      .select("kind, status, amount, currency, method, reference, occurred_at")
      .eq("invoice_id", id)
      .order("occurred_at"),
  ]);
  if (!invoice) return null;
  return {
    invoice: invoice as unknown as InvoiceDocument,
    transactions: (transactions ?? []) as unknown as InvoiceTransaction[],
  };
}
