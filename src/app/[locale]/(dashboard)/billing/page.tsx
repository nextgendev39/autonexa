import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BillingClient } from "@/components/billing/billing-client";
import { requirePagePermission } from "@/lib/auth/authorize";
import { billingConfigFromEnv } from "@/lib/billing/config";
import { canCheckOutHere, getBillingProfile, getOwnSubscription, listOwnBilling } from "@/lib/billing/data";
import { listPurchasablePlans } from "@/lib/billing/plans";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("title") };
}

export default async function Page({ searchParams }: Props) {
  await requirePagePermission("billing.manage");
  const params = await searchParams;
  const [profile, { invoices, transactions }, subscription, canCheckOut] = await Promise.all([
    getBillingProfile(),
    listOwnBilling(),
    getOwnSubscription(),
    canCheckOutHere(),
  ]);
  const plans = await listPurchasablePlans(profile?.currency ?? "AED");
  const nameOf = (id: string | null | undefined) => (id ? (plans.names.get(id) ?? null) : null);

  return (
    <BillingClient
      plans={plans.options}
      profile={profile}
      invoices={invoices}
      transactions={transactions}
      subscription={subscription}
      planName={nameOf(subscription?.plan_id)}
      scheduledPlanName={nameOf(subscription?.scheduled_plan_id)}
      canCheckOut={canCheckOut}
      isTestMode={billingConfigFromEnv().mode === "test"}
      cancelled={params.cancelled === "1"}
    />
  );
}
