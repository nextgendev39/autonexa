import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { sitePath } from "@/lib/storefront/host";
import { activeFilterCount, parseListingQuery } from "@/lib/storefront/public-vehicle";
import { requireSite } from "@/lib/storefront/site";
import { ListingScreen } from "@/components/storefront/screens/listing";
import { getLiveView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const site = await requireSite();
  const t = await getTranslations("storefront");
  const query = parseListingQuery(await searchParams);
  const heading = [query.make, query.model].filter(Boolean).join(" ");
  const filtered = activeFilterCount(query) > 0 || query.q || query.page > 1;
  return {
    title: heading ? `${heading} · ${t("listing.title")}` : t("listing.title"),
    // Filtered pages are endless variations of one page: the plain listing is the one to index.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: sitePath(await getLocale(), "/vehicles", site.defaultLocale),
      languages: {
        en: sitePath("en", "/vehicles", site.defaultLocale),
        ar: sitePath("ar", "/vehicles", site.defaultLocale),
      },
    },
  };
}

export default async function Page({ searchParams }: Props) {
  await requireSite();
  return <ListingScreen view={await getLiveView()} searchParams={await searchParams} />;
}
