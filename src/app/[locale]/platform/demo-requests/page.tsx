import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarCheckIcon, InboxIcon, TrophyIcon, UserCheckIcon } from "lucide-react";

import { KpiCard } from "@/components/cards/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { DemoRequestsTable } from "@/components/platform/demo-requests-client";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { canPlatform } from "@/lib/platform/permissions";
import { listDealerships, listDemoRequests } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatNumber } from "@/lib/utils/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.demoRequests") };
}

export default async function Page() {
  const context = await requirePlatformPage("demo_requests.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const canManage = canPlatform(context, "demo_requests.manage");
  const [requests, dealerships] = await Promise.all([
    listDemoRequests(),
    canManage && canPlatform(context, "tenants.view") ? listDealerships() : Promise.resolve([]),
  ]);
  const n = (value: number) => formatNumber(value, locale);
  const count = (statuses: string[]) => requests.filter((r) => statuses.includes(r.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("demoRequests.title")} description={t("demoRequests.description")} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("demoRequests.title")}>
        <KpiCard label={t("demoRequests.kpiNew")} value={n(count(["new"]))} icon={InboxIcon} tone="info" />
        <KpiCard
          label={t("demoRequests.kpiInProgress")}
          value={n(count(["contacted", "demo_booked"]))}
          icon={CalendarCheckIcon}
          tone="warning"
        />
        <KpiCard label={t("demoRequests.kpiConverted")} value={n(count(["converted"]))} icon={TrophyIcon} tone="success" />
        <KpiCard
          label={t("demoRequests.kpiWithAccount")}
          value={n(requests.filter((r) => r.account_user_id).length)}
          icon={UserCheckIcon}
          tone="brand"
          hint={t("demoRequests.kpiWithAccountHint")}
        />
      </section>

      <Card>
        <CardContent>
          <DemoRequestsTable
            requests={requests}
            dealerships={dealerships.map((d) => ({ id: d.id, name: d.name }))}
            canManage={canManage}
            locale={locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
