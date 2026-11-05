import type { Metadata } from "next";
import { CheckIcon, MinusIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { PlanDialog } from "@/components/platform/plans-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { canPlatform } from "@/lib/platform/permissions";
import { listPlans } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.plans") };
}

export default async function Page() {
  const context = await requirePlatformPage("plans.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const { plans, features } = await listPlans();
  const canManage = canPlatform(context, "plans.manage");
  const limit = (value: number | null) => (value === null ? t("usage.unlimited") : formatNumber(value, locale));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("plans.title")}
        description={t("plans.description")}
        actions={canManage ? <PlanDialog features={features} /> : null}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("plans.limits")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("plans.none")}
            headers={[t("plans.name"), t("plans.priceMonthly"), t("plans.priceYearly"), t("usage.users"), t("usage.branches"), t("usage.vehicles"), t("plans.storageMb"), t("plans.customDomains"), t("plans.active"), ""]}
            rows={plans.map((plan) => ({
              key: plan.id,
              cells: [
                <span key="n" className="font-medium">{plan.name}</span>,
                formatCurrency(plan.price_monthly, locale, plan.currency),
                formatCurrency(plan.price_yearly, locale, plan.currency),
                limit(plan.max_users),
                limit(plan.max_branches),
                limit(plan.max_vehicles),
                limit(plan.max_storage_mb),
                limit(plan.max_custom_domains),
                plan.is_active ? t("common.yes") : t("common.no"),
                canManage ? <PlanDialog key="e" plan={plan} features={features} /> : null,
              ],
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("plans.features")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("plans.none")}
            headers={[t("plans.feature"), ...plans.map((plan) => plan.name)]}
            rows={features.map((feature) => ({
              key: feature.key,
              cells: [
                t(`features.${feature.key}` as never),
                ...plans.map((plan) =>
                  plan.features[feature.key] ? (
                    <CheckIcon key={plan.id} className="size-4 text-emerald-600" aria-label={t("common.yes")} />
                  ) : (
                    <MinusIcon key={plan.id} className="text-muted-foreground size-4" aria-label={t("common.no")} />
                  ),
                ),
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
