import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/feedback/empty-state";
import { VehicleCard } from "@/components/storefront/vehicle-card";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/config/app";
import { sitePath } from "@/lib/storefront/host";
import { LISTING_SORTS, parseListingQuery } from "@/lib/storefront/public-vehicle";
import { requireSite, siteClient, trackEvent } from "@/lib/storefront/site";
import { listingFacets, listPublicVehicles } from "@/lib/storefront/vehicles";
import { formatNumber } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const site = await requireSite();
  const t = await getTranslations("storefront");
  return {
    title: t("listing.title"),
    alternates: {
      canonical: sitePath(await getLocale(), "/vehicles", site.defaultLocale),
      languages: { en: sitePath("en", "/vehicles", site.defaultLocale), ar: sitePath("ar", "/vehicles", site.defaultLocale) },
    },
  };
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

export default async function Page({ searchParams }: Props) {
  const site = await requireSite();
  const t = await getTranslations("storefront");
  const locale = (await getLocale()) as AppLocale;
  const query = parseListingQuery(await searchParams);
  const client = siteClient(site);
  const [{ vehicles, total, pages }, facets] = await Promise.all([listPublicVehicles(client, query), listingFacets(client)]);
  const base = sitePath(locale, "/vehicles", site.defaultLocale);
  await trackEvent(site, "page_view", { path: "/vehicles" });

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key !== "page" && value !== null && value !== "" && !(key === "sort" && value === "newest")) {
        params.set(key, String(value));
      }
    }
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };
  const choices = (name: string, label: string, options: string[], current: string | null) => (
    <label className="grid gap-1 text-sm">
      {label}
      <select name={name} defaultValue={current ?? ""} className={selectClass}>
        <option value="">{t("listing.any")}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-3xl font-semibold">{t("listing.title")}</h1>
      {/* A plain GET form: works with no JavaScript, and every result has a shareable address. */}
      <form method="get" action={base} className="bg-card ring-border grid gap-3 rounded-xl p-4 ring-1 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm sm:col-span-2">
          {t("listing.search")}
          <Input name="q" type="search" defaultValue={query.q} placeholder={t("listing.searchHint")} />
        </label>
        {choices("make", t("listing.make"), facets.makes, query.make)}
        {choices("body", t("listing.body"), facets.bodies, query.body)}
        {choices("fuel", t("listing.fuel"), facets.fuels, query.fuel)}
        {choices("transmission", t("listing.transmission"), facets.transmissions, query.transmission)}
        <label className="grid gap-1 text-sm">
          {t("listing.priceMax")}
          <Input name="priceMax" type="number" min="0" defaultValue={query.priceMax ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          {t("listing.yearMin")}
          <Input name="yearMin" type="number" min="1980" max="2100" defaultValue={query.yearMin ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          {t("listing.sort")}
          <select name="sort" defaultValue={query.sort} className={selectClass}>
            {LISTING_SORTS.map((sort) => (
              <option key={sort} value={sort}>{t(`listing.sorts.${sort}`)}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 lg:col-span-3">
          <button type="submit" className="h-9 rounded-md px-4 text-sm font-medium" style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}>
            {t("listing.apply")}
          </button>
          <Link href={base} className="text-sm hover:underline">{t("listing.clear")}</Link>
        </div>
      </form>
      <p className="text-muted-foreground text-sm" role="status">{t("listing.count", { count: total, formatted: formatNumber(total, locale) })}</p>
      {vehicles.length === 0 ? (
        <EmptyState title={t("listing.none")} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.stockNumber}
              vehicle={vehicle}
              locale={locale}
              currency={site.currency}
              href={sitePath(locale, `/vehicles/${encodeURIComponent(vehicle.stockNumber)}`, site.defaultLocale)}
            />
          ))}
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label={t("listing.pages")} className="flex items-center justify-center gap-4 text-sm">
          {query.page > 1 ? <Link href={pageHref(query.page - 1)} className="hover:underline">{t("listing.previous")}</Link> : null}
          <span>{t("listing.pageOf", { page: query.page, pages })}</span>
          {query.page < pages ? <Link href={pageHref(query.page + 1)} className="hover:underline">{t("listing.next")}</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
