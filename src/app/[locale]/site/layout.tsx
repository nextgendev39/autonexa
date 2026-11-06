import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { SiteMotion } from "@/components/storefront/reveal";
import { SiteShell } from "@/components/storefront/site-shell";
import { assetUrl, pick } from "@/lib/storefront/config";
import { sitePath } from "@/lib/storefront/host";
import { getSite, requireSite, siteClient } from "@/lib/storefront/site";
import { listingFacets } from "@/lib/storefront/vehicles";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (!site) return { title: { absolute: "Not found" }, robots: { index: false, follow: false } };
  const locale = await getLocale();
  const logo = assetUrl(site.config.logoPath);
  const title = pick(site.config.seo.title, locale) || site.displayName;
  const description =
    pick(site.config.seo.description, locale) || pick(site.config.tagline, locale) || undefined;
  return {
    metadataBase: new URL(`https://${site.host}`),
    title: { default: title, template: `%s · ${site.displayName}` },
    description,
    applicationName: site.displayName,
    appleWebApp: { title: site.displayName },
    ...(logo ? { icons: { icon: logo } } : {}),
    openGraph: { siteName: site.displayName, title, description, type: "website", locale },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await requireSite();
  const locale = await getLocale();
  const store = await headers();

  // Set by the proxy, on an address with no language in it.
  const unprefixed = store.get("x-storefront-unprefixed");
  if (unprefixed && site.defaultLocale === "ar") redirect(sitePath("ar", unprefixed, "ar"));

  const other = locale === "ar" ? "en" : "ar";
  const href = (path: string) => sitePath(locale, path, site.defaultLocale);
  const facets = await listingFacets(siteClient(site));
  return (
    <SiteMotion>
      <SiteShell
        name={site.displayName}
        config={site.config}
        href={href}
        switchHref={sitePath(other, "/", site.defaultLocale)}
        facets={facets}
      >
        {children}
      </SiteShell>
    </SiteMotion>
  );
}
