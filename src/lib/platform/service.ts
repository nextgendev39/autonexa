import "server-only";

import { startInviteVerification, VerificationEmailError } from "@/lib/auth/email-verification-server";
import { isMailerConfigured, sendEmail } from "@/lib/email/send-email";
import {
  createDealershipOwner,
  createStaffLogin,
  dealershipAdminEmails,
  dealershipHasOwner,
  removeDealershipOwner,
  removeStaffLogin,
} from "@/lib/server/privileged/platform";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything the console reads or changes. All of it goes through the signed-in user's session, so
 * RLS and the database's own permission checks apply on top of the route's. Service-role code is
 * limited to creating logins, in lib/server/privileged/platform.ts.
 */

export type DbError = { code?: string; message?: string } | null;

type Row = Record<string, unknown>;
const list = <T>(data: unknown) => (data ?? []) as T[];

export type PlanRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_users: number | null;
  max_branches: number | null;
  max_vehicles: number | null;
  max_storage_mb: number | null;
  max_custom_domains: number | null;
  grace_days: number;
  is_active: boolean;
  sort_order: number;
};
export type FeatureRow = { key: string; name: string; description: string | null };
export type PlanWithFeatures = PlanRow & { features: Record<string, boolean> };

export type DealershipRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  number_prefix: string;
  created_at: string;
};
export type SubscriptionRow = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "expired" | "cancelled";
  billing_cycle: "monthly" | "yearly" | "custom";
  started_at: string;
  current_period_end: string | null;
  ended_at: string | null;
  created_at: string;
  amount: number | null;
  currency: string | null;
  is_test: boolean;
  cancel_at_period_end: boolean;
  plans: { name: string; key: string; price_monthly: number; price_yearly: number; currency: string } | null;
};
export type UsageRow = {
  tenant_id: string;
  users: number;
  branches: number;
  vehicles: number;
  storage_bytes: number;
};
export type InvoiceRow = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  invoice_number: string;
  amount: number;
  currency: string;
  status: "draft" | "issued" | "paid" | "void";
  description: string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  is_test: boolean;
  kind: string;
  tenants?: { name: string } | null;
};
export type TransactionRow = {
  id: string;
  invoice_id: string;
  tenant_id: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  occurred_at: string;
  kind: "payment" | "refund";
  status: "succeeded" | "pending" | "failed";
  gateway: string | null;
  failure_reason: string | null;
  is_test: boolean;
  parent_transaction_id: string | null;
  tenants?: { name: string } | null;
};
export type SettingsRow = {
  tenant_id: string;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  timezone: string;
  default_locale: string;
  currency: string;
};
export type DomainRow = {
  id: string;
  tenant_id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
  verification_status: "pending" | "verified" | "failed";
  ssl_status: "pending" | "active" | "failed";
};
export type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  tenant_id: string | null;
  metadata: Row;
  created_at: string;
};
export type StaffRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
};

const SUBSCRIPTION_SELECT =
  "id, tenant_id, plan_id, status, billing_cycle, started_at, current_period_end, ended_at, created_at, amount, currency, is_test, cancel_at_period_end, plans!tenant_subscriptions_plan_id_fkey(name, key, price_monthly, price_yearly, currency)";
const CURRENT = ["trialing", "active", "past_due"];

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listDealerships() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants" as never)
    .select("id, name, slug, status, number_prefix, created_at")
    .order("name");
  return list<DealershipRow>(data);
}

export async function getDealership(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants" as never)
    .select("id, name, slug, status, number_prefix, created_at")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as DealershipRow | null;
}

export async function listSubscriptions(dealershipId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("tenant_subscriptions" as never)
    .select(SUBSCRIPTION_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (dealershipId) query = query.eq("tenant_id", dealershipId);
  const { data } = await query;
  return list<SubscriptionRow>(data);
}

export async function listCurrentSubscriptions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_subscriptions" as never)
    .select(SUBSCRIPTION_SELECT)
    .in("status", CURRENT);
  return list<SubscriptionRow>(data);
}

/** Each dealership's newest subscription, so an expired one still shows against it. */
export async function latestSubscriptionByDealership() {
  const latest = new Map<string, SubscriptionRow>();
  for (const row of await listSubscriptions()) {
    if (!latest.has(row.tenant_id)) latest.set(row.tenant_id, row);
  }
  return latest;
}

export async function getUsage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_usage" as never);
  return list<UsageRow>(data).map((row) => ({
    ...row,
    users: Number(row.users),
    branches: Number(row.branches),
    vehicles: Number(row.vehicles),
    storage_bytes: Number(row.storage_bytes),
  }));
}

export async function listPlans(): Promise<{ plans: PlanWithFeatures[]; features: FeatureRow[] }> {
  const supabase = await createClient();
  const [{ data: plans }, { data: features }, { data: enabled }] = await Promise.all([
    supabase
      .from("plans" as never)
      .select(
        "id, key, name, description, price_monthly, price_yearly, currency, max_users, max_branches, max_vehicles, max_storage_mb, max_custom_domains, grace_days, is_active, sort_order",
      )
      .order("sort_order"),
    supabase.from("platform_features" as never).select("key, name, description").order("sort_order"),
    supabase.from("plan_features" as never).select("plan_id, feature_key, enabled"),
  ]);
  const flags = list<{ plan_id: string; feature_key: string; enabled: boolean }>(enabled);
  return {
    features: list<FeatureRow>(features),
    plans: list<PlanRow>(plans).map((plan) => ({
      ...plan,
      price_monthly: Number(plan.price_monthly),
      price_yearly: Number(plan.price_yearly),
      features: Object.fromEntries(
        flags.filter((flag) => flag.plan_id === plan.id).map((flag) => [flag.feature_key, flag.enabled]),
      ),
    })),
  };
}

export async function listInvoices(dealershipId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("subscription_invoices" as never)
    .select(
      "id, tenant_id, subscription_id, invoice_number, amount, currency, status, description, issued_at, due_at, paid_at, is_test, kind, tenants(name)",
    )
    .order("issued_at", { ascending: false })
    .limit(500);
  if (dealershipId) query = query.eq("tenant_id", dealershipId);
  const { data } = await query;
  return list<InvoiceRow>(data).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function listTransactions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_transactions" as never)
    .select(
      "id, invoice_id, tenant_id, amount, currency, method, reference, occurred_at, kind, status, gateway, failure_reason, is_test, parent_transaction_id, tenants(name)",
    )
    .order("occurred_at", { ascending: false })
    .limit(1000);
  return list<TransactionRow>(data).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function getDealershipSettings(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_settings" as never)
    .select(
      "tenant_id, display_name, logo_url, primary_color, contact_email, contact_phone, address, timezone, default_locale, currency",
    )
    .eq("tenant_id", id)
    .maybeSingle();
  return data as unknown as SettingsRow | null;
}

export async function listDomains(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_domains" as never)
    .select("id, tenant_id, domain, is_primary, verified_at, verification_status, ssl_status")
    .eq("tenant_id", id)
    .order("domain");
  return list<DomainRow>(data);
}

export async function listAuditLogs(options: { dealershipId?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("platform_audit_logs" as never)
    .select("id, actor_id, action, target_type, target_id, tenant_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.dealershipId) query = query.eq("tenant_id", options.dealershipId);
  const { data } = await query;
  return list<AuditRow>(data);
}

export async function listStaff() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_admin_list" as never);
  return list<StaffRow>(data);
}

/**
 * Yearly plans count at a twelfth. Custom terms have no list price, so they count as nothing. What was
 * actually agreed wins over the list price, and test subscriptions aren't revenue.
 */
export function monthlyValue(subscription: SubscriptionRow) {
  const plan = subscription.plans;
  if (!plan || subscription.status === "trialing" || subscription.is_test) return 0;
  const paid = subscription.amount === null ? null : Number(subscription.amount);
  if (subscription.billing_cycle === "monthly") return paid ?? Number(plan.price_monthly);
  if (subscription.billing_cycle === "yearly") return (paid ?? Number(plan.price_yearly)) / 12;
  return 0;
}

export const subscriptionCurrency = (subscription: SubscriptionRow) =>
  subscription.currency ?? subscription.plans?.currency ?? "AED";

export function endingWithinDays(subscriptions: SubscriptionRow[], days: number) {
  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
  return subscriptions
    .filter((s) => s.current_period_end && new Date(s.current_period_end).getTime() <= cutoff)
    .sort((a, b) => String(a.current_period_end).localeCompare(String(b.current_period_end)));
}

/** Real money that has settled. Failed attempts, pending refunds and test payments aren't. */
export const settled = (transactions: TransactionRow[]) =>
  transactions.filter((tx) => tx.status === "succeeded" && !tx.is_test);

/** Currency -> total. AED and INR can't be added together, so a total is always per currency. */
export function totalsByCurrency<T extends { currency: string }>(rows: T[], amount: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + amount(row));
  return totals;
}

export function receivedThisMonth(transactions: TransactionRow[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return totalsByCurrency(
    settled(transactions).filter((tx) => new Date(tx.occurred_at).getTime() >= monthStart),
    (tx) => tx.amount,
  );
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

type Owner = { ownerEmail: string; ownerFirstName: string; ownerLastName: string };

/** Creates a dealership's first Super Admin and emails their invitation. */
export async function inviteOwner(dealershipId: string, owner: Owner) {
  if (await dealershipHasOwner(dealershipId)) return { error: "has_owner" as const };
  if (!isMailerConfigured()) return { error: "email_not_configured" as const };
  const { userId, error } = await createDealershipOwner(dealershipId, {
    email: owner.ownerEmail,
    firstName: owner.ownerFirstName,
    lastName: owner.ownerLastName,
  });
  if (error || !userId) {
    const message = error?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) return { error: "email_taken" as const };
    if (message.startsWith("plan_limit") || message.startsWith("subscription_inactive")) {
      return { error: "plan_limit" as const };
    }
    return { error: "invite_failed" as const };
  }
  try {
    await startInviteVerification({ userId, email: owner.ownerEmail });
  } catch (cause) {
    await removeDealershipOwner(dealershipId, userId);
    return { error: cause instanceof VerificationEmailError ? ("email_failed" as const) : ("invite_failed" as const) };
  }
  await recordEvent("tenant.owner_invited", "tenants", dealershipId, dealershipId, { email: owner.ownerEmail });
  return { error: null };
}

export async function recordEvent(
  action: string,
  targetType: string,
  targetId: string,
  dealershipId: string | null,
  metadata: Row = {},
) {
  const supabase = await createClient();
  await supabase.rpc(
    "platform_record_event" as never,
    {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_scope_id: dealershipId,
      p_metadata: metadata,
    } as never,
  );
}

export async function inviteStaff(input: { email: string; firstName: string; lastName: string; role: string }) {
  if (!isMailerConfigured()) return { error: "email_not_configured" as const };
  const { userId, error } = await createStaffLogin(input);
  if (error || !userId) {
    const message = error?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) return { error: "email_taken" as const };
    return { error: "invite_failed" as const };
  }
  // Through the session, so the permission check and audit trail apply.
  const supabase = await createClient();
  const { error: grantError } = await supabase
    .from("platform_admins" as never)
    .insert({ user_id: userId, role: input.role } as never);
  if (grantError) {
    await removeStaffLogin(userId);
    return { error: "invite_failed" as const };
  }
  try {
    await startInviteVerification({ userId, email: input.email });
  } catch (cause) {
    await removeStaffLogin(userId);
    return { error: cause instanceof VerificationEmailError ? ("email_failed" as const) : ("invite_failed" as const) };
  }
  return { error: null };
}

/** Best effort: a suspended dealership's staff can't sign in to read the notification. */
export async function emailDealershipStatus(dealershipId: string, status: "active" | "suspended") {
  if (!isMailerConfigured()) return false;
  try {
    const emails = await dealershipAdminEmails(dealershipId);
    const suspended = status === "suspended";
    const subject = suspended ? "Your AutoNexa account has been suspended" : "Your AutoNexa account is active again";
    const text = suspended
      ? "Your dealership's AutoNexa account has been suspended and staff can no longer sign in. Your records are safe. Please contact AutoNexa support."
      : "Your dealership's AutoNexa account is active again. Staff can sign in as usual.";
    await Promise.all(
      emails.map((to) => sendEmail({ to, subject, text, html: `<p>${text}</p>` })),
    );
    return emails.length > 0;
  } catch (error) {
    console.error("[platform] could not email dealership status", error);
    return false;
  }
}

type Result = { error: DbError };

export async function createDealership(values: {
  name: string;
  slug: string;
  numberPrefix: string;
  planId: string;
  status: string;
  billingCycle: string;
  periodEnd: string | null;
}): Promise<{ id: string | null; error: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants" as never)
    .insert({ name: values.name, slug: values.slug, number_prefix: values.numberPrefix } as never)
    .select("id")
    .single();
  const id = (data as unknown as { id: string } | null)?.id ?? null;
  if (error || !id) return { id: null, error };

  const { error: settingsError } = await supabase
    .from("tenant_settings" as never)
    .insert({ tenant_id: id, display_name: values.name } as never);
  if (settingsError) return { id, error: settingsError };

  const { error: planError } = await assignPlan(id, values);
  return { id, error: planError };
}

export async function updateDealership(
  id: string,
  values: {
    name: string;
    displayName?: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    contactEmail: string | null;
    contactPhone?: string | null;
    address?: string | null;
    timezone: string;
    defaultLocale: string;
    currency: string;
  },
): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants" as never)
    .update({ name: values.name } as never)
    .eq("id", id)
    .select("id");
  if (error) return { error };
  if (!data?.length) return { error: { code: "P0002" } };
  const { error: settingsError } = await supabase.from("tenant_settings" as never).upsert(
    {
      tenant_id: id,
      display_name: values.displayName || null,
      logo_url: values.logoUrl,
      primary_color: values.primaryColor,
      contact_email: values.contactEmail,
      contact_phone: values.contactPhone || null,
      address: values.address || null,
      timezone: values.timezone,
      default_locale: values.defaultLocale,
      currency: values.currency,
    } as never,
  );
  return { error: settingsError };
}

export async function setDealershipStatus(id: string, status: string, reason?: string | null): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "platform_set_tenant_status" as never,
    { p_tenant_id: id, p_status: status, p_reason: reason ?? null } as never,
  );
  return { error };
}

export async function assignPlan(
  id: string,
  values: { planId: string; status: string; billingCycle: string; periodEnd: string | null },
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "platform_assign_plan" as never,
    {
      p_tenant_id: id,
      p_plan_id: values.planId,
      p_status: values.status,
      p_billing_cycle: values.billingCycle,
      p_period_end: values.periodEnd,
    } as never,
  );
  return { error };
}

/** A subscription ID from the browser is only acted on if it belongs to this dealership. */
async function ownSubscription(dealershipId: string, subscriptionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_subscriptions" as never)
    .select("id")
    .eq("id", subscriptionId)
    .eq("tenant_id", dealershipId)
    .maybeSingle();
  return Boolean(data);
}

export async function renewSubscription(dealershipId: string, subscriptionId: string, periodEnd: string): Promise<Result> {
  if (!(await ownSubscription(dealershipId, subscriptionId))) return { error: { code: "P0002" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "platform_renew_subscription" as never,
    { p_subscription_id: subscriptionId, p_period_end: periodEnd } as never,
  );
  return { error };
}

export async function cancelSubscription(dealershipId: string, subscriptionId: string, reason?: string | null): Promise<Result> {
  if (!(await ownSubscription(dealershipId, subscriptionId))) return { error: { code: "P0002" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "platform_cancel_subscription" as never,
    { p_subscription_id: subscriptionId, p_reason: reason ?? null } as never,
  );
  return { error };
}

export async function addDomain(id: string, domain: string, isPrimary?: boolean): Promise<Result> {
  const supabase = await createClient();
  if (isPrimary) {
    const { error } = await supabase
      .from("tenant_domains" as never)
      .update({ is_primary: false } as never)
      .eq("tenant_id", id)
      .eq("is_primary", true);
    if (error) return { error };
  }
  const { error } = await supabase
    .from("tenant_domains" as never)
    .insert({ tenant_id: id, domain, is_primary: Boolean(isPrimary) } as never);
  return { error };
}

export async function removeDomain(id: string, domainId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_domains" as never)
    .delete()
    .eq("id", domainId)
    .eq("tenant_id", id);
  return { error };
}

type PlanValues = {
  name: string;
  description?: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  maxUsers: number | null;
  maxBranches: number | null;
  maxVehicles: number | null;
  maxStorageMb: number | null;
  maxCustomDomains: number | null;
  graceDays: number;
  isActive: boolean;
  sortOrder: number;
  features: Record<string, boolean>;
};

const planColumns = (values: PlanValues) => ({
  name: values.name,
  description: values.description || null,
  price_monthly: values.priceMonthly,
  price_yearly: values.priceYearly,
  currency: values.currency,
  max_users: values.maxUsers,
  max_branches: values.maxBranches,
  max_vehicles: values.maxVehicles,
  max_storage_mb: values.maxStorageMb,
  max_custom_domains: values.maxCustomDomains,
  grace_days: values.graceDays,
  is_active: values.isActive,
  sort_order: values.sortOrder,
});

async function savePlanFeatures(planId: string, features: Record<string, boolean>): Promise<Result> {
  const supabase = await createClient();
  const { data: known } = await supabase.from("platform_features" as never).select("key");
  // Every feature gets a row, so nothing is left to a default. Unknown keys from the browser drop out.
  const rows = list<{ key: string }>(known).map(({ key }) => ({
    plan_id: planId,
    feature_key: key,
    enabled: features[key] === true,
  }));
  const { error } = await supabase.from("plan_features" as never).upsert(rows as never);
  return { error };
}

export async function createPlan(values: PlanValues & { key: string }): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans" as never)
    .insert({ key: values.key, ...planColumns(values) } as never)
    .select("id")
    .single();
  if (error || !data) return { error };
  return savePlanFeatures((data as unknown as { id: string }).id, values.features);
}

export async function updatePlan(id: string, values: PlanValues): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans" as never)
    .update(planColumns(values) as never)
    .eq("id", id)
    .select("id");
  if (error) return { error };
  if (!data?.length) return { error: { code: "P0002" } };
  return savePlanFeatures(id, values.features);
}

export async function createInvoice(
  dealershipId: string,
  values: {
    amount: number;
    currency: string;
    description?: string | null;
    subscriptionId: string | null;
    status: string;
    dueAt: string | null;
  },
  actorId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("subscription_invoices" as never).insert({
    tenant_id: dealershipId,
    amount: values.amount,
    currency: values.currency,
    description: values.description || null,
    // A subscription from another dealership fails the composite key.
    subscription_id: values.subscriptionId,
    status: values.status,
    due_at: values.dueAt,
    created_by: actorId,
  } as never);
  return { error };
}

export async function setInvoiceStatus(id: string, status: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_invoices" as never)
    .update({ status } as never)
    .eq("id", id)
    .select("id");
  if (error) return { error };
  return { error: data?.length ? null : { code: "P0002" } };
}

export async function recordPayment(
  invoiceId: string,
  values: { amount: number; method: string; reference?: string | null; notes?: string | null },
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "platform_record_payment" as never,
    {
      p_invoice_id: invoiceId,
      p_amount: values.amount,
      p_method: values.method,
      p_reference: values.reference || null,
      p_notes: values.notes || null,
    } as never,
  );
  return { error };
}

export async function updateStaffRole(userId: string, role: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_admins" as never)
    .update({ role } as never)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error };
  return { error: data?.length ? null : { code: "P0002" } };
}

export async function removeStaff(userId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_admins" as never)
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error };
  return { error: data?.length ? null : { code: "P0002" } };
}

export type StorefrontOverviewRow = {
  tenant_id: string;
  tenant_name: string;
  slug: string;
  tenant_status: string;
  status: string;
  published_at: string | null;
  platform_disabled: boolean;
  platform_disabled_reason: string | null;
  domains: number;
  verified_domains: number;
  listed_vehicles: number;
  visitors_30d: number;
  enquiries_30d: number;
};

export async function listStorefronts() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_storefront_overview" as never);
  return list<StorefrontOverviewRow>(data);
}

export async function setStorefrontDisabled(id: string, disabled: boolean, reason?: string | null): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "platform_set_storefront_disabled" as never,
    { p_tenant_id: id, p_disabled: disabled, p_reason: reason ?? null } as never,
  );
  return { error };
}

export type BillingReportRow = {
  month: string;
  currency: string;
  received: number;
  refunded: number;
  tax: number;
  failed: number;
  payments: number;
};

export async function getBillingReport(months = 12) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_billing_report" as never, { p_months: months } as never);
  return list<BillingReportRow>(data);
}

export type WebhookEventRow = {
  gateway: string;
  event_id: string;
  event_type: string;
  status: string;
  is_test: boolean;
  error: string | null;
  attempts: number;
  received_at: string;
};
export type CheckoutRow = {
  id: string;
  tenant_id: string;
  kind: string;
  gateway: string;
  status: string;
  review_reason: string | null;
  is_test: boolean;
  created_at: string;
  tenants: { name: string } | null;
};

export async function listBillingActivity() {
  const supabase = await createClient();
  const [{ data: events }, { data: checkouts }] = await Promise.all([
    supabase
      .from("billing_webhook_events" as never)
      .select("gateway, event_id, event_type, status, is_test, error, attempts, received_at")
      .order("received_at", { ascending: false })
      .limit(100),
    supabase
      .from("billing_checkouts" as never)
      .select("id, tenant_id, kind, gateway, status, review_reason, is_test, created_at, tenants(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  return { events: list<WebhookEventRow>(events), checkouts: list<CheckoutRow>(checkouts) };
}

export type TaxRateRow = { country: string; label: string; rate: number };
export type BillingEntityRow = { currency: string; legal_name: string; tax_id: string | null; address: string | null; email: string | null };
export type PlanPriceRow = { plan_id: string; currency: string; billing_cycle: string; amount: number };

export async function getBillingSettings() {
  const supabase = await createClient();
  const [{ data: taxes }, { data: entities }, { data: prices }] = await Promise.all([
    supabase.from("billing_tax_rates" as never).select("country, label, rate").order("country"),
    supabase.from("billing_entities" as never).select("currency, legal_name, tax_id, address, email").order("currency"),
    supabase.from("plan_prices" as never).select("plan_id, currency, billing_cycle, amount"),
  ]);
  return { taxes: list<TaxRateRow>(taxes), entities: list<BillingEntityRow>(entities), prices: list<PlanPriceRow>(prices) };
}

export async function saveTaxRate(values: { country: string; label: string; rate: number }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("billing_tax_rates" as never).upsert(values as never, { onConflict: "country" });
  return { error };
}

export async function saveBillingEntity(values: {
  currency: string;
  legalName: string;
  taxId?: string | null;
  address?: string | null;
  email?: string | null;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("billing_entities" as never).upsert(
    {
      currency: values.currency,
      legal_name: values.legalName,
      tax_id: values.taxId || null,
      address: values.address || null,
      email: values.email || null,
    } as never,
    { onConflict: "currency" },
  );
  return { error };
}

export async function savePlanPrices(values: { planId: string; currency: string; monthly: number | null; yearly: number | null }): Promise<Result> {
  const supabase = await createClient();
  for (const [cycle, amount] of [["monthly", values.monthly], ["yearly", values.yearly]] as const) {
    const { error } =
      amount === null
        ? await supabase
            .from("plan_prices" as never)
            .delete()
            .eq("plan_id", values.planId)
            .eq("currency", values.currency)
            .eq("billing_cycle", cycle)
        : await supabase.from("plan_prices" as never).upsert(
            { plan_id: values.planId, currency: values.currency, billing_cycle: cycle, amount } as never,
            { onConflict: "plan_id,currency,billing_cycle" },
          );
    if (error) return { error };
  }
  return { error: null };
}
