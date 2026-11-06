import Link from "next/link";
import { SearchXIcon, XIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { valueLabel } from "@/components/storefront/labels";
import { ListingFilters } from "@/components/storefront/listing-filters";
import { SearchBox } from "@/components/storefront/search-box";
import { SortSelect } from "@/components/storefront/sort-select";
import { VehicleCard } from "@/components/storefront/vehicle-card";
import {
  activeFilterCount,
  LISTING_SORTS,
  listingSearchParams,
  parseListingQuery,
  type ListingQuery,
} from "@/lib/storefront/public-vehicle";
import type { SiteView } from "@/lib/storefront/view";
import { listingFacets, listPublicVehicles } from "@/lib/storefront/vehicles";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

/** Page numbers with gaps: 1 … 4 5 6 … 12. */
function pageList(current: number, pages: number) {
  const wanted = new Set(
    [1, pages, current - 1, current, current + 1].filter((n) => n >= 1 && n <= pages),
  );
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((n, i) =>
    i > 0 && n - sorted[i - 1] > 1 ? (["gap", n] as const) : ([n] as const),
  );
}

export async function ListingScreen({
  view,
  searchParams,
}: {
  view: SiteView;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const t = await getTranslations("storefront");
  const { locale } = view;
  const query = parseListingQuery(searchParams);
  const { client } = view;
  const [{ vehicles, total, pages }, facets] = await Promise.all([
    listPublicVehicles(client, query, view.tenantId),
    listingFacets(client),
  ]);
  const base = view.href("/vehicles");
  await view.track("page_view", { path: "/vehicles" });

  const hrefWith = (changes: Partial<ListingQuery>) => {
    const search = listingSearchParams({ ...query, page: 1, ...changes }).toString();
    return search ? `${base}?${search}` : base;
  };
  const current = Object.fromEntries(listingSearchParams(query));

  const money = (value: number) => formatCurrency(value, locale, view.currency);
  const chips: { label: string; href: string }[] = [
    query.q ? { label: `“${query.q}”`, href: hrefWith({ q: "" }) } : null,
    query.condition
      ? { label: valueLabel(t, "condition", query.condition)!, href: hrefWith({ condition: null }) }
      : null,
    query.make ? { label: query.make, href: hrefWith({ make: null, model: null }) } : null,
    query.model ? { label: query.model, href: hrefWith({ model: null }) } : null,
    query.body
      ? { label: valueLabel(t, "body", query.body)!, href: hrefWith({ body: null }) }
      : null,
    query.priceMin !== null
      ? {
          label: `${t("listing.priceMin")}: ${money(query.priceMin)}`,
          href: hrefWith({ priceMin: null }),
        }
      : null,
    query.priceMax !== null
      ? {
          label: `${t("listing.priceMax")}: ${money(query.priceMax)}`,
          href: hrefWith({ priceMax: null }),
        }
      : null,
    query.yearMin !== null
      ? { label: `${t("listing.yearMin")}: ${query.yearMin}`, href: hrefWith({ yearMin: null }) }
      : null,
    query.yearMax !== null
      ? { label: `${t("listing.yearMax")}: ${query.yearMax}`, href: hrefWith({ yearMax: null }) }
      : null,
    query.mileageMax !== null
      ? {
          label: `${t("listing.mileageMax")}: ${formatNumber(query.mileageMax, locale)}`,
          href: hrefWith({ mileageMax: null }),
        }
      : null,
    query.transmission
      ? {
          label: valueLabel(t, "transmission", query.transmission)!,
          href: hrefWith({ transmission: null }),
        }
      : null,
    query.fuel
      ? { label: valueLabel(t, "fuel", query.fuel)!, href: hrefWith({ fuel: null }) }
      : null,
    query.engine ? { label: query.engine, href: hrefWith({ engine: null }) } : null,
    query.city ? { label: query.city, href: hrefWith({ city: null }) } : null,
    query.availability
      ? {
          label: valueLabel(t, "availability", query.availability)!,
          href: hrefWith({ availability: null }),
        }
      : null,
  ].filter((chip): chip is { label: string; href: string } => Boolean(chip));

  const heading =
    [query.condition ? valueLabel(t, "condition", query.condition) : null, query.make, query.model]
      .filter(Boolean)
      .join(" ") || t("listing.title");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {heading}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm" role="status">
              {t("listing.count", { count: total, formatted: formatNumber(total, locale) })}
            </p>
          </div>
          <SearchBox
            action={base}
            vehicleBase={base}
            defaultValue={query.q}
            hidden={current}
            api={view.api}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
          <ListingFilters
            facets={facets}
            query={query}
            action={base}
            locale={locale}
            activeCount={activeFilterCount(query)}
            total={total}
          />

          <div className="grid content-start gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="lg:hidden">
                {/* Filters button sits in ListingFilters on phones. */}
              </div>
              <SortSelect
                action={base}
                current={query.sort}
                hidden={current}
                options={LISTING_SORTS.map((sort) => ({
                  value: sort,
                  label: t(`listing.sorts.${sort}`),
                }))}
                label={t("listing.sort")}
              />
            </div>

            {chips.length ? (
              <ul className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <li key={chip.label}>
                    <Link
                      href={chip.href}
                      className="bg-muted hover:bg-muted/70 inline-flex h-8 items-center gap-1.5 rounded-full ps-3 pe-2 text-xs font-medium"
                    >
                      {chip.label}
                      <XIcon className="size-3.5" aria-label={t("listing.clear")} />
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={base}
                    className="text-muted-foreground hover:text-foreground px-2 text-xs font-semibold underline-offset-4 hover:underline"
                  >
                    {t("listing.reset")}
                  </Link>
                </li>
              </ul>
            ) : null}

            {vehicles.length === 0 ? (
              <div className="bg-card ring-border grid justify-items-center gap-3 rounded-lg px-6 py-16 text-center ring-1">
                <span className="bg-muted flex size-14 items-center justify-center rounded-full">
                  <SearchXIcon className="text-muted-foreground size-6" aria-hidden />
                </span>
                <h2 className="font-heading text-lg font-semibold">{t("listing.none")}</h2>
                <p className="text-muted-foreground max-w-sm text-sm">{t("listing.noneHint")}</p>
                <Link
                  href={base}
                  className="mt-2 inline-flex h-10 items-center rounded-lg px-5 text-sm font-semibold"
                  style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
                >
                  {t("listing.reset")}
                </Link>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {vehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.stockNumber}
                    vehicle={vehicle}
                    locale={locale}
                    currency={view.currency}
                    href={view.href(`/vehicles/${encodeURIComponent(vehicle.stockNumber)}`)}
                  />
                ))}
              </div>
            )}

            {pages > 1 ? (
              <nav
                aria-label={t("listing.pages")}
                className="flex flex-wrap items-center justify-center gap-1.5 pt-4 text-sm"
              >
                {query.page > 1 ? (
                  <Link
                    href={hrefWith({ page: query.page - 1 })}
                    className="hover:bg-muted rounded-md px-3 py-2 font-medium"
                  >
                    {t("listing.previous")}
                  </Link>
                ) : null}
                {pageList(query.page, pages).map((item, index) =>
                  item === "gap" ? (
                    <span key={`gap-${index}`} className="text-muted-foreground px-1">
                      …
                    </span>
                  ) : (
                    <Link
                      key={item}
                      href={hrefWith({ page: item })}
                      aria-current={item === query.page ? "page" : undefined}
                      aria-label={t("listing.page", { page: item })}
                      className="hover:bg-muted flex size-9 items-center justify-center rounded-md font-medium aria-[current=page]:text-[color:var(--sf-on-primary)] aria-[current=page]:[background:var(--sf-primary)]"
                    >
                      {formatNumber(item, locale)}
                    </Link>
                  ),
                )}
                {query.page < pages ? (
                  <Link
                    href={hrefWith({ page: query.page + 1 })}
                    className="hover:bg-muted rounded-md px-3 py-2 font-medium"
                  >
                    {t("listing.next")}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
