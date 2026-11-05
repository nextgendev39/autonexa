import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { canPlatform } from "@/lib/platform/permissions";
import { listAuditLogs, listDealerships, listStaff } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatDate } from "@/lib/utils/date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.audit") };
}

export default async function Page() {
  const context = await requirePlatformPage("audit.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const [entries, staff, dealerships] = await Promise.all([
    listAuditLogs({ limit: 300 }),
    listStaff(),
    canPlatform(context, "tenants.view") ? listDealerships() : Promise.resolve([]),
  ]);
  const people = new Map(staff.map((person) => [person.user_id, person.email]));
  const names = new Map(dealerships.map((d) => [d.id, d.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("audit.title")} description={t("audit.description")} />
      <Card>
        <CardContent>
          <DataTable
            empty={t("audit.none")}
            headers={[t("audit.when"), t("audit.actor"), t("audit.action"), t("tenants.name")]}
            rows={entries.map((entry) => ({
              key: entry.id,
              cells: [
                formatDate(entry.created_at, locale, "medium"),
                entry.actor_id ? (people.get(entry.actor_id) ?? entry.actor_id) : t("audit.system"),
                <code key="c" className="text-xs">{entry.action}</code>,
                entry.tenant_id ? (
                  <Link key="t" href={`/platform/tenants/${entry.tenant_id}`} className="hover:underline">
                    {names.get(entry.tenant_id) ?? entry.tenant_id}
                  </Link>
                ) : (
                  "—"
                ),
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
