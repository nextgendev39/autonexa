import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { UsageCell } from "@/components/platform/usage-cell";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { formatBytes } from "@/lib/platform/format";
import { getUsage, latestSubscriptionByDealership, listDealerships, listPlans } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatNumber } from "@/lib/utils/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.usage") };
}

export default async function Page() {
  await requirePlatformPage("usage.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const [usage, dealerships, latest, { plans }] = await Promise.all([
    getUsage(),
    listDealerships(),
    latestSubscriptionByDealership(),
    listPlans(),
  ]);
  const names = new Map(dealerships.map((d) => [d.id, d.name]));
  const planOf = (id: string) => plans.find((p) => p.id === latest.get(id)?.plan_id);
  const count = (value: number, limit: number | null | undefined) => (
    <UsageCell
      used={value}
      limit={limit ?? null}
      usedLabel={formatNumber(value, locale)}
      limitLabel={limit == null ? "" : formatNumber(limit, locale)}
      unlimitedLabel={t("usage.unlimited")}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("usage.title")} description={t("usage.description")} />
      <Card>
        <CardContent>
          <DataTable
            empty={t("common.none")}
            headers={[t("tenants.name"), t("subscriptions.plan"), t("usage.users"), t("usage.branches"), t("usage.vehicles"), t("usage.storage")]}
            rows={usage.map((row) => {
              const plan = planOf(row.tenant_id);
              const storageLimit = plan?.max_storage_mb == null ? null : plan.max_storage_mb * 1024 * 1024;
              return {
                key: row.tenant_id,
                cells: [
                  <Link key="n" href={`/platform/tenants/${row.tenant_id}`} className="font-medium hover:underline">
                    {names.get(row.tenant_id) ?? row.tenant_id}
                  </Link>,
                  plan?.name ?? "—",
                  count(row.users, plan?.max_users),
                  count(row.branches, plan?.max_branches),
                  count(row.vehicles, plan?.max_vehicles),
                  <UsageCell
                    key="s"
                    used={row.storage_bytes}
                    limit={storageLimit}
                    usedLabel={formatBytes(row.storage_bytes)}
                    limitLabel={storageLimit === null ? "" : formatBytes(storageLimit)}
                    unlimitedLabel={t("usage.unlimited")}
                  />,
                ],
              };
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
