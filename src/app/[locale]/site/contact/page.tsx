import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { sitePath } from "@/lib/storefront/host";
import { requireSite } from "@/lib/storefront/site";
import { ContactScreen } from "@/components/storefront/screens/contact";
import { getLiveView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await requireSite();
  const t = await getTranslations("storefront");
  return {
    title: t("contact.title"),
    alternates: { canonical: sitePath(await getLocale(), "/contact", site.defaultLocale) },
  };
}

export default async function Page() {
  await requireSite();
  return <ContactScreen view={await getLiveView()} />;
}
