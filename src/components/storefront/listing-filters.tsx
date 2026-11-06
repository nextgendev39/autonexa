"use client";

import Link from "next/link";
import { RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { NativeSelect } from "@/components/inventory/native-select";
import { dropEmptyFields, valueLabel, type ValueKind } from "@/components/storefront/labels";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AppLocale } from "@/config/app";
import type { ListingQuery } from "@/lib/storefront/public-vehicle";
import type { Facet, ListingFacets } from "@/lib/storefront/vehicles";
import { formatNumber } from "@/lib/utils/currency";

type Props = {
  facets: ListingFacets;
  query: ListingQuery;
  action: string;
  locale: AppLocale;
  activeCount: number;
  total: number;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Every filter in one GET form, so results are shareable and work without JavaScript. On wide
 * screens a change applies at once; on phones the same form sits in a drawer with one button.
 */
function FilterForm({
  facets,
  query,
  action,
  locale,
  autoSubmit,
}: Props & { autoSubmit: boolean }) {
  const t = useTranslations("storefront");
  const form = useRef<HTMLFormElement>(null);
  const [make, setMake] = useState(query.make ?? "");
  const submit = () => {
    if (autoSubmit) form.current?.requestSubmit();
  };

  const choices = (name: keyof ListingQuery, label: string, options: Facet[], kind?: ValueKind) => (
    <Field label={label}>
      <NativeSelect
        name={name}
        defaultValue={(query[name] as string | null) ?? ""}
        onChange={submit}
      >
        <option value="">{t("listing.any")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {(kind ? valueLabel(t, kind, option.value) : option.value) ?? option.value} (
            {formatNumber(option.count, locale)})
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
  const number = (
    name: keyof ListingQuery,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Field label={label}>
      <Input
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        defaultValue={(query[name] as number | null) ?? ""}
        onBlur={submit}
        className="h-11 md:h-10"
        {...props}
      />
    </Field>
  );

  return (
    <form ref={form} method="get" action={action} onSubmit={dropEmptyFields} className="grid gap-4">
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.sort !== "newest" ? <input type="hidden" name="sort" value={query.sort} /> : null}

      {choices("condition", t("listing.condition"), facets.conditions, "condition")}
      <Field label={t("listing.make")}>
        <NativeSelect
          name="make"
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
            // The model belongs to the old make, so it goes with it.
            const model = form.current?.elements.namedItem("model") as HTMLSelectElement | null;
            if (model) model.value = "";
            setTimeout(submit);
          }}
        >
          <option value="">{t("listing.any")}</option>
          {facets.makes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value} ({formatNumber(option.count, locale)})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("listing.model")}>
        <NativeSelect
          name="model"
          defaultValue={query.model ?? ""}
          disabled={!make}
          onChange={submit}
        >
          <option value="">{t("listing.any")}</option>
          {(facets.models[make] ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.value} ({formatNumber(option.count, locale)})
            </option>
          ))}
        </NativeSelect>
      </Field>
      {choices("body", t("listing.body"), facets.bodies, "body")}

      <div className="grid grid-cols-2 gap-3">
        {number("priceMin", t("listing.priceMin"), { step: 1000 })}
        {number("priceMax", t("listing.priceMax"), { step: 1000 })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {number("yearMin", t("listing.yearMin"), { min: 1980, max: 2100 })}
        {number("yearMax", t("listing.yearMax"), { min: 1980, max: 2100 })}
      </div>
      {number("mileageMax", t("listing.mileageMax"), { step: 5000 })}

      {choices("transmission", t("listing.transmission"), facets.transmissions, "transmission")}
      {choices("fuel", t("listing.fuel"), facets.fuels, "fuel")}
      {facets.engines.length ? choices("engine", t("listing.engine"), facets.engines) : null}
      {facets.cities.length > 1 || query.city
        ? choices("city", t("listing.city"), facets.cities)
        : null}
      <Field label={t("listing.availability")}>
        <NativeSelect name="availability" defaultValue={query.availability ?? ""} onChange={submit}>
          <option value="">{t("listing.any")}</option>
          <option value="available">{t("values.availability.available")}</option>
          <option value="reserved">{t("values.availability.reserved")}</option>
        </NativeSelect>
      </Field>

      <div className="grid gap-2 pt-1">
        <button
          type="submit"
          className="h-11 rounded-lg text-sm font-semibold md:h-10"
          style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
        >
          {t("listing.apply")}
        </button>
        <Link
          href={action}
          className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium"
        >
          <RotateCcwIcon className="size-4" aria-hidden />
          {t("listing.reset")}
        </Link>
      </div>
    </form>
  );
}

export function ListingFilters(props: Props) {
  const t = useTranslations("storefront");
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden lg:block">
        <div className="bg-card ring-border sticky top-20 max-h-[calc(100svh-6rem)] overflow-y-auto rounded-lg p-5 ring-1">
          <h2 className="font-heading mb-4 flex items-center gap-2 text-base font-semibold">
            <SlidersHorizontalIcon className="size-4" aria-hidden />
            {t("listing.filters")}
          </h2>
          <FilterForm {...props} autoSubmit />
        </div>
      </aside>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-border bg-card inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"
        >
          <SlidersHorizontalIcon className="size-4" aria-hidden />
          {props.activeCount
            ? t("listing.filtersCount", { count: props.activeCount })
            : t("listing.filters")}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-xl">
            <SheetHeader>
              <SheetTitle>{t("listing.filters")}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <FilterForm {...props} autoSubmit={false} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
