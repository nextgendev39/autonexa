import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { PlatformStatus } from "@/components/platform/platform-ui";
import { CreateTenantDialog } from "@/components/platform/tenants-client";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { canPlatform } from "@/lib/platform/permissions";
import { latestSubscriptionByDealership, listDealerships, listPlans } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatDate } from "@/lib/utils/date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.tenants") };
}

export default async function Page() {
  const context = await requirePlatformPage("tenants.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const [dealerships, latest, { plans }] = await Promise.all([
    listDealerships(),
    latestSubscriptionByDealership(),
    listPlans(),
  ]);
  // Needs both: the dialog creates the dealership and assigns its plan.
  const canCreate = canPlatform(context, "tenants.manage") && canPlatform(context, "subscriptions.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("tenants.title")}
        description={t("tenants.description")}
        actions={
          canCreate ? <CreateTenantDialog plans={plans.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }))} /> : null
        }
      />
      <Card>
        <CardContent>
          <DataTable
            empty={t("tenants.none")}
            headers={[t("tenants.name"), t("tenants.status"), t("subscriptions.plan"), t("subscriptions.status"), t("subscriptions.periodEnd"), t("tenants.created")]}
            rows={dealerships.map((d) => {
              const sub = latest.get(d.id);
              return {
                key: d.id,
                cells: [
                  <Link key="n" href={`/platform/tenants/${d.id}`} className="font-medium hover:underline">
                    {d.name}
                  </Link>,
                  <PlatformStatus key="s" status={d.status} />,
                  sub?.plans?.name ?? "—",
                  sub ? <PlatformStatus key="ss" status={sub.status} /> : "—",
                  sub?.current_period_end ? formatDate(sub.current_period_end, locale) : t("subscriptions.noExpiry"),
                  formatDate(d.created_at, locale),
                ],
              };
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
