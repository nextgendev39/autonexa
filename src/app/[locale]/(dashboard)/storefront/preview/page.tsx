import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { SiteShell } from "@/components/storefront/site-shell";
import { StorefrontHome } from "@/components/storefront/site-sections";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppLocale } from "@/config/app";
import { requirePagePermission } from "@/lib/auth/authorize";
import { tenantClient } from "@/lib/server/privileged";
import { getStorefront } from "@/lib/storefront/manage";
import { featuredVehicles, latestVehicles } from "@/lib/storefront/vehicles";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("storefrontAdmin");
  return { title: t("preview"), robots: { index: false, follow: false } };
}

/** The draft, using the same components visitors get. Links stay on this page. */
export default async function Page() {
  const context = await requirePagePermission("storefront.manage");
  const t = await getTranslations("storefrontAdmin");
  const locale = (await getLocale()) as AppLocale;
  const { draft } = await getStorefront(context);
  const client = tenantClient(context);
  const supabase = await createClient();
  const [featured, latest, tenant, settings] = await Promise.all([
    featuredVehicles(client, draft.featuredStockNumbers),
    latestVehicles(client),
    supabase.from("tenants" as never).select("name").maybeSingle(),
    supabase.from("tenant_settings" as never).select("display_name, currency").maybeSingle(),
  ]);
  const row = settings.data as unknown as { display_name: string | null; currency: string } | null;
  const name = row?.display_name ?? (tenant.data as unknown as { name: string } | null)?.name ?? "";
  const stay = () => "#";

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>{t("previewNotice")}</AlertDescription>
      </Alert>
      <div className="ring-border overflow-hidden rounded-xl ring-1">
        <SiteShell name={name} config={draft} href={stay} switchHref="#">
          <StorefrontHome
            name={name}
            locale={locale}
            currency={row?.currency ?? "AED"}
            config={draft}
            featured={featured}
            latest={latest}
            href={stay}
          />
        </SiteShell>
      </div>
    </div>
  );
}
