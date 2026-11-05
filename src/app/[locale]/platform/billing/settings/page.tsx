import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { BillingSettingsClient } from "@/components/platform/billing-settings-client";
import { canPlatform } from "@/lib/platform/permissions";
import { getBillingSettings, listPlans } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("billingSettings.title") };
}

export default async function Page() {
  const context = await requirePlatformPage("billing.view");
  const t = await getTranslations("platform");
  const [{ taxes, entities, prices }, { plans }] = await Promise.all([getBillingSettings(), listPlans()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("billingSettings.title")} description={t("billingSettings.description")} />
      <BillingSettingsClient
        taxes={taxes}
        entities={entities}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name, currency: plan.currency }))}
        prices={prices}
        canManageBilling={canPlatform(context, "billing.manage")}
        canManagePlans={canPlatform(context, "plans.manage")}
      />
    </div>
  );
}
