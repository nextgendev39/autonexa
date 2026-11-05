import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { PlatformStatus } from "@/components/platform/platform-ui";
import { StorefrontToggleAction } from "@/components/platform/storefront-actions";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { canPlatform } from "@/lib/platform/permissions";
import { listStorefronts } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatNumber } from "@/lib/utils/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.storefronts") };
}

export default async function Page() {
  const context = await requirePlatformPage("storefronts.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const sites = await listStorefronts();
  const canManage = canPlatform(context, "storefronts.manage");
  const base = process.env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN;
  const n = (value: number) => formatNumber(Number(value), locale);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("storefronts.title")} description={t("storefronts.description")} />
      <Card>
        <CardContent>
          <DataTable
            empty={t("common.none")}
            headers={[t("tenants.name"), t("storefronts.address"), t("storefronts.status"), t("storefronts.domains"), t("storefronts.listed"), t("storefronts.visitors"), t("storefronts.enquiries"), ""]}
            rows={sites.map((site) => ({
              key: site.tenant_id,
              cells: [
                <Link key="n" href={`/platform/tenants/${site.tenant_id}`} className="font-medium hover:underline">
                  {site.tenant_name}
                </Link>,
                base ? `${site.slug}.${base}` : site.slug,
                <div key="s" className="flex flex-wrap gap-1">
                  <PlatformStatus status={site.status} />
                  {site.platform_disabled ? <PlatformStatus status="platform_disabled" /> : null}
                </div>,
                `${n(site.verified_domains)} / ${n(site.domains)}`,
                n(site.listed_vehicles),
                n(site.visitors_30d),
                n(site.enquiries_30d),
                canManage ? <StorefrontToggleAction key="a" id={site.tenant_id} disabled={site.platform_disabled} /> : null,
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
