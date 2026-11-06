import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { sitePath } from "@/lib/storefront/host";
import { requireSite } from "@/lib/storefront/site";
import { HomeScreen } from "@/components/storefront/screens/home";
import { getLiveView } from "@/lib/storefront/view";

// Photo addresses are signed per request, and every host is a different dealership.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await requireSite();
  return {
    alternates: {
      canonical: sitePath(await getLocale(), "/", site.defaultLocale),
      languages: {
        en: sitePath("en", "/", site.defaultLocale),
        ar: sitePath("ar", "/", site.defaultLocale),
      },
    },
  };
}

export default async function Page() {
  await requireSite();
  return <HomeScreen view={await getLiveView()} />;
}
