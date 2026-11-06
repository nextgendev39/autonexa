"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { dropEmptyFields, valueLabel } from "@/components/storefront/labels";
import { SearchBox } from "@/components/storefront/search-box";
import { NativeSelect } from "@/components/inventory/native-select";
import type { AppLocale } from "@/config/app";
import type { ListingFacets } from "@/lib/storefront/vehicles";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

/** Price steps for "up to", chosen from what's listed so every option finds something. */
function priceSteps(range: ListingFacets["priceRange"]) {
  if (!range) return [];
  const steps = [
    25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 300_000, 500_000, 750_000, 1_000_000,
    2_000_000,
  ];
  return steps.filter((step) => step > range.min && step < range.max * 1.5).slice(0, 8);
}

/** The home page's search: make, model, body and budget, or free text. A plain GET form. */
export function HeroSearch({
  facets,
  action,
  vehicleBase,
  locale,
  currency,
  api,
}: {
  facets: ListingFacets;
  action: string;
  vehicleBase: string;
  locale: AppLocale;
  currency: string;
  api?: string;
}) {
  const t = useTranslations("storefront");
  const [tab, setTab] = useState<"all" | "used" | "new">("all");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [body, setBody] = useState("");
  const steps = useMemo(() => priceSteps(facets.priceRange), [facets.priceRange]);

  const count = useMemo(() => {
    if (body && make) return null;
    if (model) return facets.models[make]?.find((item) => item.value === model)?.count ?? 0;
    if (make) return facets.makes.find((item) => item.value === make)?.count ?? 0;
    if (body) return facets.bodies.find((item) => item.value === body)?.count ?? 0;
    if (tab !== "all") return facets.conditions.find((item) => item.value === tab)?.count ?? 0;
    return facets.total;
  }, [body, facets, make, model, tab]);

  const tabs = [
    { key: "all", label: t("home.allCars") },
    { key: "used", label: t("nav.used") },
    { key: "new", label: t("nav.new") },
  ] as const;

  return (
    <div className="bg-card text-card-foreground ring-border rounded-lg p-4 shadow-xl ring-1 sm:p-5">
      <div
        role="tablist"
        className="bg-muted mb-4 flex w-full rounded-lg p-1 text-sm font-medium sm:inline-flex sm:w-auto"
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 whitespace-nowrap transition-colors sm:flex-none sm:px-3.5",
              tab === item.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form
        method="get"
        action={action}
        onSubmit={dropEmptyFields}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        {tab !== "all" ? <input type="hidden" name="condition" value={tab} /> : null}
        <NativeSelect
          name="make"
          aria-label={t("listing.make")}
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
            setModel("");
          }}
        >
          <option value="">{t("home.searchMake")}</option>
          {facets.makes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({formatNumber(item.count, locale)})
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="model"
          aria-label={t("listing.model")}
          value={model}
          disabled={!make}
          onChange={(event) => setModel(event.target.value)}
        >
          <option value="">{t("home.searchModel")}</option>
          {(facets.models[make] ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.value} ({formatNumber(item.count, locale)})
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="body"
          aria-label={t("listing.body")}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        >
          <option value="">{t("home.searchBody")}</option>
          {facets.bodies.map((item) => (
            <option key={item.value} value={item.value}>
              {valueLabel(t, "body", item.value)} ({formatNumber(item.count, locale)})
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="priceMax" aria-label={t("listing.priceMax")} defaultValue="">
          <option value="">{t("home.searchPrice")}</option>
          {steps.map((step) => (
            <option key={step} value={step}>
              {t("home.searchUpTo", { price: formatCurrency(step, locale, currency) })}
            </option>
          ))}
        </NativeSelect>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold whitespace-nowrap transition-[filter] hover:brightness-110 sm:col-span-2 md:h-10 lg:col-span-1"
          style={{ background: "var(--sf-accent)", color: "var(--sf-on-accent)" }}
        >
          <SearchIcon className="size-4" aria-hidden />
          {count === null ? t("listing.search") : t("home.searchButton", { count })}
        </button>
      </form>
      <div className="border-border mt-4 border-t pt-4">
        <SearchBox action={action} vehicleBase={vehicleBase} api={api} />
      </div>
    </div>
  );
}
