"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { FormField } from "@/components/forms/form-field";
import {
  countActiveFilters,
  useInventoryUrlState,
} from "@/components/inventory/inventory-query";
import { bodyTypeKey } from "@/components/inventory/inventory-utils";
import {
  BRANCH_ICON,
  FUEL_ICONS,
  LOCATION_ICON,
  MODEL_ICON,
  ORDER_ICONS,
  ORIGIN_ICONS,
  SORT_ICONS,
  STATUS_ICONS,
  TRANSMISSION_ICONS,
  bodyTypeIcon,
} from "@/components/inventory/vehicle-select-icons";
import { BrandLogo } from "@/components/shared/brand-logo";
import { DebouncedFilterInput, FilterGroup } from "@/components/shared/filter-controls";
import { ListFilterBar } from "@/components/shared/list-filter-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { STOCK_AGE_KEYS, type StockAgeBand } from "@/lib/vehicles/stock-age";
import { usePermission } from "@/hooks/use-permission";
import { useInventoryMeta } from "@/hooks/use-vehicles";
import {
  BODY_TYPES,
  FUEL_TYPES,
  ORIGIN_TYPES,
  TRANSMISSION_TYPES,
  VEHICLE_MARKET_TYPES,
  VEHICLE_SORT_FIELDS,
  INVENTORY_STATUSES,
} from "@/types/vehicle";

/** Same colours as the "Days in stock" card's bands. */
const STOCK_AGE_DOTS: Record<StockAgeBand, string> = {
  fresh: "bg-emerald-500",
  mid: "bg-brand",
  aging: "bg-orange-500",
  old: "bg-rose-500",
};

const ADVANCED_KEYS = [
  "branchId",
  "locationId",
  "make",
  "model",
  "yearFrom",
  "yearTo",
  "originType",
  "fuelType",
  "transmission",
  "bodyType",
  "stockAge",
  "includeArchived",
  "sort",
  "order",
] as const;

export function VehicleFilters({ actions }: { actions?: React.ReactNode }) {
  const t = useTranslations();
  const { can } = usePermission();
  const { searchParams, update, clear } = useInventoryUrlState();
  const meta = useInventoryMeta();

  const activeCount = countActiveFilters(searchParams);
  const hasQuery = activeCount > 0 || Boolean(searchParams.get("q"));
  const branchId = searchParams.get("branchId") ?? "";
  const makeValue = searchParams.get("make") ?? "";
  const advancedCount = ADVANCED_KEYS.filter((key) => {
    if (key === "sort") return (searchParams.get("sort") ?? "created_at") !== "created_at";
    if (key === "order") return (searchParams.get("order") ?? "desc") !== "desc";
    return Boolean(searchParams.get(key));
  }).length;

  const locations = useMemo(() => {
    const all = meta.data?.locations ?? [];
    return branchId ? all.filter((location) => location.branchId === branchId) : all;
  }, [meta.data, branchId]);

  const selectedMake = useMemo(
    () =>
      (meta.data?.makes ?? []).find(
        (make) => make.name.toLowerCase() === makeValue.trim().toLowerCase(),
      ),
    [meta.data?.makes, makeValue],
  );

  const modelOptions = useMemo(() => {
    const models = meta.data?.models ?? [];
    return selectedMake
      ? models.filter((model) => model.makeId === selectedMake.id)
      : models;
  }, [meta.data?.models, selectedMake]);

  const chips = useMemo(() => {
    const items: {
      key: string;
      label: string;
      value: string;
      onRemove: () => void;
    }[] = [];

    const q = searchParams.get("q")?.trim();
    if (q) {
      items.push({
        key: "q",
        label: t("inventory.filters.search"),
        value: q,
        onRemove: () => update({ q: null }),
      });
    }

    const status = searchParams.get("status");
    if (status) {
      items.push({
        key: "status",
        label: t("inventory.filters.status"),
        value: t(`inventory.status.${status}`),
        onRemove: () => update({ status: null }),
      });
    }

    const marketType = searchParams.get("marketType");
    if (marketType) {
      items.push({
        key: "marketType",
        label: t("inventory.filters.marketType"),
        value: t(`inventory.enums.marketType.${marketType}`),
        onRemove: () => update({ marketType: null }),
      });
    }

    if (branchId) {
      const branch = meta.data?.branches.find((item) => item.id === branchId);
      items.push({
        key: "branchId",
        label: t("inventory.filters.branch"),
        value: branch?.name ?? branchId,
        onRemove: () => update({ branchId: null, locationId: null }),
      });
    }

    const locationId = searchParams.get("locationId");
    if (locationId) {
      const location = locations.find((item) => item.id === locationId);
      items.push({
        key: "locationId",
        label: t("inventory.filters.location"),
        value: location?.name ?? locationId,
        onRemove: () => update({ locationId: null }),
      });
    }

    if (makeValue) {
      items.push({
        key: "make",
        label: t("inventory.filters.make"),
        value: makeValue,
        onRemove: () => update({ make: null, model: null }),
      });
    }

    const model = searchParams.get("model");
    if (model) {
      items.push({
        key: "model",
        label: t("inventory.filters.model"),
        value: model,
        onRemove: () => update({ model: null }),
      });
    }

    const bodyType = searchParams.get("bodyType");
    if (bodyType) {
      items.push({
        key: "bodyType",
        label: t("inventory.filters.bodyType"),
        value: t(`inventory.enums.bodyType.${bodyTypeKey(bodyType)}`),
        onRemove: () => update({ bodyType: null }),
      });
    }

    const yearFrom = searchParams.get("yearFrom");
    const yearTo = searchParams.get("yearTo");
    if (yearFrom || yearTo) {
      items.push({
        key: "year",
        label: t("inventory.filters.year"),
        value: [yearFrom || "…", yearTo || "…"].join(" – "),
        onRemove: () => update({ yearFrom: null, yearTo: null }),
      });
    }

    const originType = searchParams.get("originType");
    if (originType) {
      items.push({
        key: "originType",
        label: t("inventory.filters.origin"),
        value: t(`inventory.enums.origin.${originType}`),
        onRemove: () => update({ originType: null }),
      });
    }

    const fuelType = searchParams.get("fuelType");
    if (fuelType) {
      items.push({
        key: "fuelType",
        label: t("inventory.filters.fuelType"),
        value: t(`inventory.enums.fuel.${fuelType}`),
        onRemove: () => update({ fuelType: null }),
      });
    }

    const transmission = searchParams.get("transmission");
    if (transmission) {
      items.push({
        key: "transmission",
        label: t("inventory.filters.transmission"),
        value: t(`inventory.enums.transmission.${transmission}`),
        onRemove: () => update({ transmission: null }),
      });
    }

    const stockAge = searchParams.get("stockAge");
    if (stockAge && (STOCK_AGE_KEYS as readonly string[]).includes(stockAge)) {
      items.push({
        key: "stockAge",
        label: t("inventory.filters.stockAge"),
        value: t(`inventory.filters.stockAgeBands.${stockAge}` as Parameters<typeof t>[0]),
        onRemove: () => update({ stockAge: null }),
      });
    }

    if (searchParams.get("includeArchived") === "true") {
      items.push({
        key: "includeArchived",
        label: t("inventory.filters.includeArchived"),
        value: t("common.yes"),
        onRemove: () => update({ includeArchived: null }),
      });
    }

    return items;
  }, [branchId, locations, makeValue, meta.data?.branches, searchParams, t, update]);

  return (
    <ListFilterBar
      ariaLabel={t("inventory.filters.searchLabel")}
      actions={actions}
      advancedCount={advancedCount}
      basicCount={["status", "marketType"].filter((key) => Boolean(searchParams.get(key))).length}
      hasActiveFilters={hasQuery}
      onClear={clear}
      chips={chips}
      drawerTitle={t("inventory.filters.drawerTitle")}
      drawerDescription={t("inventory.filters.drawerHint")}
      search={
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <DebouncedFilterInput
            type="search"
            inputMode="search"
            aria-label={t("inventory.filters.searchLabel")}
            placeholder={t("inventory.filters.searchPlaceholder")}
            className="h-11 ps-9 md:h-10"
            value={searchParams.get("q") ?? ""}
            onCommit={(value) => update({ q: value })}
          />
        </div>
      }
      basicFilters={
        <>
          <SearchableSelect
            aria-label={t("inventory.filters.status")}
            value={searchParams.get("status") ?? ""}
            onValueChange={(value) => update({ status: value })}
            optional
            placeholder={t("inventory.filters.allStatuses")}
            options={INVENTORY_STATUSES.map((status) => ({
              value: status,
              label: t(`inventory.status.${status}`),
              icon: STATUS_ICONS[status],
            }))}
          />
          <SearchableSelect
            aria-label={t("inventory.filters.marketType")}
            value={searchParams.get("marketType") ?? ""}
            onValueChange={(value) => update({ marketType: value })}
            optional
            searchable={false}
            placeholder={t("inventory.filters.allMarketTypes")}
            options={VEHICLE_MARKET_TYPES.map((type) => ({
              value: type,
              label: t(`inventory.enums.marketType.${type}`),
            }))}
          />
        </>
      }
      drawerContent={
        <div className="grid gap-2.5">
          <FilterGroup
            title={t("inventory.filters.groupVehicle")}
            dense
            collapsible
            defaultOpen
            activeCount={
              ["branchId", "locationId", "make", "model", "bodyType", "stockAge"].filter((key) =>
                Boolean(searchParams.get(key)),
              ).length
            }
          >
            <FormField label={t("inventory.filters.branch")} htmlFor="filter-branch">
              <SearchableSelect
                id="filter-branch"
                value={branchId}
                onValueChange={(value) => update({ branchId: value, locationId: null })}
                optional
                placeholder={t("inventory.filters.allBranches")}
                options={(meta.data?.branches ?? []).map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                  icon: BRANCH_ICON,
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.location")} htmlFor="filter-location">
              <SearchableSelect
                id="filter-location"
                value={searchParams.get("locationId") ?? ""}
                onValueChange={(value) => update({ locationId: value })}
                optional
                placeholder={t("inventory.filters.allLocations")}
                options={locations.map((location) => ({
                  value: location.id,
                  label: location.name,
                  icon: LOCATION_ICON,
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.make")} htmlFor="filter-make">
              <SearchableSelect
                id="filter-make"
                value={makeValue}
                onValueChange={(value) => update({ make: value, model: null })}
                optional
                placeholder={t("inventory.filters.anyMake")}
                options={(meta.data?.makes ?? []).map((make) => ({
                  value: make.name,
                  label: make.name,
                  icon: <BrandLogo name={make.name} />,
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.model")} htmlFor="filter-model">
              <SearchableSelect
                id="filter-model"
                value={searchParams.get("model") ?? ""}
                onValueChange={(value) => update({ model: value })}
                optional
                placeholder={t("inventory.filters.anyModel")}
                options={modelOptions.map((model) => ({
                  value: model.name,
                  label: model.name,
                  icon: MODEL_ICON,
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.bodyType")} htmlFor="filter-body">
              <SearchableSelect
                id="filter-body"
                value={searchParams.get("bodyType") ?? ""}
                onValueChange={(value) => update({ bodyType: value })}
                optional
                placeholder={t("inventory.filters.allBodyTypes")}
                options={BODY_TYPES.map((type) => ({
                  value: type,
                  label: t(`inventory.enums.bodyType.${bodyTypeKey(type)}`),
                  icon: bodyTypeIcon(type),
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.stockAge")} htmlFor="filter-stock-age">
              <SearchableSelect
                id="filter-stock-age"
                value={searchParams.get("stockAge") ?? ""}
                onValueChange={(value) => update({ stockAge: value })}
                optional
                searchable={false}
                placeholder={t("inventory.filters.anyStockAge")}
                options={STOCK_AGE_KEYS.map((key) => ({
                  value: key,
                  label: t(`inventory.filters.stockAgeBands.${key}`),
                  icon: <span className={cn("size-2.5 rounded-full", STOCK_AGE_DOTS[key])} />,
                }))}
              />
            </FormField>
          </FilterGroup>

          <FilterGroup
            title={t("inventory.filters.groupSpecs")}
            dense
            collapsible
            activeCount={
              [
                "yearFrom",
                "yearTo",
                "originType",
                "fuelType",
                "transmission",
                "includeArchived",
              ].filter((key) => Boolean(searchParams.get(key))).length +
              ((searchParams.get("sort") ?? "created_at") !== "created_at" ? 1 : 0) +
              ((searchParams.get("order") ?? "desc") !== "desc" ? 1 : 0)
            }
          >
            <FormField label={t("inventory.filters.yearFrom")} htmlFor="filter-year-from">
              <DebouncedFilterInput
                id="filter-year-from"
                inputMode="numeric"
                maxLength={4}
                placeholder="2018"
                className="h-11 md:h-10"
                value={searchParams.get("yearFrom") ?? ""}
                onCommit={(value) => update({ yearFrom: value })}
              />
            </FormField>
            <FormField label={t("inventory.filters.yearTo")} htmlFor="filter-year-to">
              <DebouncedFilterInput
                id="filter-year-to"
                inputMode="numeric"
                maxLength={4}
                placeholder="2024"
                className="h-11 md:h-10"
                value={searchParams.get("yearTo") ?? ""}
                onCommit={(value) => update({ yearTo: value })}
              />
            </FormField>
            <FormField label={t("inventory.filters.origin")} htmlFor="filter-origin">
              <SearchableSelect
                id="filter-origin"
                value={searchParams.get("originType") ?? ""}
                onValueChange={(value) => update({ originType: value })}
                optional
                searchable={false}
                placeholder={t("inventory.filters.allOrigins")}
                options={ORIGIN_TYPES.map((type) => ({
                  value: type,
                  label: t(`inventory.enums.origin.${type}`),
                  icon: ORIGIN_ICONS[type],
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.fuelType")} htmlFor="filter-fuel">
              <SearchableSelect
                id="filter-fuel"
                value={searchParams.get("fuelType") ?? ""}
                onValueChange={(value) => update({ fuelType: value })}
                optional
                searchable={false}
                placeholder={t("inventory.filters.allFuelTypes")}
                options={FUEL_TYPES.map((type) => ({
                  value: type,
                  label: t(`inventory.enums.fuel.${type}`),
                  icon: FUEL_ICONS[type],
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.transmission")} htmlFor="filter-transmission">
              <SearchableSelect
                id="filter-transmission"
                value={searchParams.get("transmission") ?? ""}
                onValueChange={(value) => update({ transmission: value })}
                optional
                searchable={false}
                placeholder={t("inventory.filters.allTransmissions")}
                options={TRANSMISSION_TYPES.map((type) => ({
                  value: type,
                  label: t(`inventory.enums.transmission.${type}`),
                  icon: TRANSMISSION_ICONS[type],
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.sort")} htmlFor="filter-sort">
              <SearchableSelect
                id="filter-sort"
                value={searchParams.get("sort") ?? "created_at"}
                onValueChange={(value) => update({ sort: value })}
                searchable={false}
                options={VEHICLE_SORT_FIELDS.filter(
                  // Purchase date is acquisition-only; the server ignores this sort otherwise.
                  (field) => field !== "purchase_date" || can("acquisition.view"),
                ).map((field) => ({
                  value: field,
                  label: t(`inventory.sort.${field}`),
                  icon: SORT_ICONS[field],
                }))}
              />
            </FormField>
            <FormField label={t("inventory.filters.order")} htmlFor="filter-order">
              <SearchableSelect
                id="filter-order"
                value={searchParams.get("order") ?? "desc"}
                onValueChange={(value) => update({ order: value })}
                searchable={false}
                options={[
                  { value: "desc", label: t("inventory.filters.desc"), icon: ORDER_ICONS.desc },
                  { value: "asc", label: t("inventory.filters.asc"), icon: ORDER_ICONS.asc },
                ]}
              />
            </FormField>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="filter-archived"
                checked={searchParams.get("includeArchived") === "true"}
                onCheckedChange={(checked) =>
                  update({ includeArchived: checked ? "true" : null })
                }
              />
              <Label htmlFor="filter-archived" className="cursor-pointer">
                {t("inventory.filters.includeArchived")}
              </Label>
            </div>
          </FilterGroup>
        </div>
      }
    />
  );
}
