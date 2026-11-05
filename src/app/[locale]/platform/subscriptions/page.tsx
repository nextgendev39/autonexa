import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { PlatformStatus } from "@/components/platform/platform-ui";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { canPlatform } from "@/lib/platform/permissions";
import { latestSubscriptionByDealership, listDealerships } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatDate } from "@/lib/utils/date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.subscriptions") };
}

export default async function Page() {
  const context = await requirePlatformPage("subscriptions.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const [latest, dealerships] = await Promise.all([
    latestSubscriptionByDealership(),
    canPlatform(context, "tenants.view") ? listDealerships() : Promise.resolve([]),
  ]);
  const names = new Map(dealerships.map((d) => [d.id, d.name]));
  // Soonest ending first, then those with no end date.
  const rows = [...latest.values()].sort((a, b) =>
    (a.current_period_end ?? "9999").localeCompare(b.current_period_end ?? "9999"),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("subscriptions.title")} description={t("subscriptions.description")} />
      <Card>
        <CardContent>
          <DataTable
            empty={t("common.none")}
            headers={[t("tenants.name"), t("subscriptions.plan"), t("subscriptions.status"), t("subscriptions.cycle"), t("subscriptions.periodEnd")]}
            rows={rows.map((s) => ({
              key: s.id,
              cells: [
                <Link key="n" href={`/platform/tenants/${s.tenant_id}`} className="font-medium hover:underline">
                  {names.get(s.tenant_id) ?? s.tenant_id}
                </Link>,
                s.plans?.name ?? "—",
                <PlatformStatus key="s" status={s.status} />,
                t(`cycle.${s.billing_cycle}`),
                s.current_period_end ? formatDate(s.current_period_end, locale) : t("subscriptions.noExpiry"),
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
