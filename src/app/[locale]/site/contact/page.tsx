import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ContactDetails } from "@/components/storefront/site-sections";
import { EnquiryForm } from "@/components/storefront/enquiry-form";
import type { AppLocale } from "@/config/app";
import { sitePath } from "@/lib/storefront/host";
import { requireSite, trackEvent } from "@/lib/storefront/site";

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
  const site = await requireSite();
  const t = await getTranslations("storefront");
  const locale = (await getLocale()) as AppLocale;
  await trackEvent(site, "page_view", { path: "/contact" });
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="grid content-start gap-4">
        <h1 className="font-heading text-3xl font-semibold">{t("contact.title")}</h1>
        <ContactDetails config={site.config} locale={locale} />
      </section>
      <section className="bg-card ring-border grid gap-4 rounded-xl p-5 ring-1">
        <h2 className="font-heading text-lg font-semibold">{t("enquiry.title")}</h2>
        <EnquiryForm stockNumber={null} locale={locale} canRequestBooking={false} />
      </section>
    </div>
  );
}
