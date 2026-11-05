import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { StorefrontHome } from "@/components/storefront/site-sections";
import type { AppLocale } from "@/config/app";
import { sitePath } from "@/lib/storefront/host";
import { requireSite, siteClient, trackEvent } from "@/lib/storefront/site";
import { featuredVehicles, latestVehicles } from "@/lib/storefront/vehicles";

// Photo addresses are signed per request, and every host is a different dealership.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await requireSite();
  return {
    alternates: {
      canonical: sitePath(await getLocale(), "/", site.defaultLocale),
      languages: { en: sitePath("en", "/", site.defaultLocale), ar: sitePath("ar", "/", site.defaultLocale) },
    },
  };
}

export default async function Page() {
  const site = await requireSite();
  const locale = (await getLocale()) as AppLocale;
  const client = siteClient(site);
  const [featured, latest] = await Promise.all([
    featuredVehicles(client, site.config.featuredStockNumbers),
    latestVehicles(client),
  ]);
  await trackEvent(site, "page_view", { path: "/" });
  return (
    <StorefrontHome
      name={site.displayName}
      locale={locale}
      currency={site.currency}
      config={site.config}
      featured={featured}
      latest={latest}
      href={(path) => sitePath(locale, path, site.defaultLocale)}
    />
  );
}
