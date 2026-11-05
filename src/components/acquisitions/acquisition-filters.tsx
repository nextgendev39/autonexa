"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  countActiveFilters,
  useAcquisitionUrlState,
} from "@/components/acquisitions/acquisition-query";
import {
  ACQUISITION_DOCUMENT_ICONS,
  ACQUISITION_PAYMENT_ICONS,
  ACQUISITION_REGISTRATION_ICONS,
  ACQUISITION_SORT_ICONS,
  ACQUISITION_SOURCE_ICONS,
  ACQUISITION_STATUS_ICONS,
  BRANCH_ICON,
  MODEL_ICON,
  ORDER_ICONS,
} from "@/components/acquisitions/acquisition-select-icons";
import { FormField } from "@/components/forms/form-field";
import { BrandLogo } from "@/components/shared/brand-logo";
import { DebouncedFilterInput, FilterGroup } from "@/components/shared/filter-controls";
import { ListFilterBar } from "@/components/shared/list-filter-bar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAcquisitionMeta } from "@/hooks/use-acquisitions";
import { usePermission } from "@/hooks/use-permission";
import {
  ACQUISITION_DOCUMENT_STATUSES,
  ACQUISITION_PAYMENT_STATUSES,
  ACQUISITION_REGISTRATION_STATUSES,
  ACQUISITION_SORT_FIELDS,
  ACQUISITION_SOURCE_TYPES,
  ACQUISITION_STATUSES,
} from "@/types/acquisition";

const ADVANCED_KEYS = [
  "sourceType",
  "make",
  "model",
  "purchaseDateFrom",
  "purchaseDateTo",
  "createdFrom",
  "createdTo",
  "paymentStatus",
  "documentStatus",
  "registrationStatus",
  "priceMin",
  "priceMax",
  "sort",
  "order",
] as const;

export function AcquisitionFilters({ actions }: { actions?: React.ReactNode }) {
  const t = useTranslations();
  const { searchParams, update, clear } = useAcquisitionUrlState();
  const meta = useAcquisitionMeta();
  const { can } = usePermission();
  const showCost = can("acquisition.cost.view") || can("vehicle.cost.view");

  const activeCount = countActiveFilters(searchParams);
  const hasQuery = activeCount > 0 || Boolean(searchParams.get("q"));
  const branchId = searchParams.get("branchId") ?? "";
  const makeValue = searchParams.get("make") ?? "";
  const advancedCount = ADVANCED_KEYS.filter((key) => {
    if ((key === "priceMin" || key === "priceMax") && !showCost) return false;
    if (key === "sort") return (searchParams.get("sort") ?? "created_at") !== "created_at";
    if (key === "order") return (searchParams.get("order") ?? "desc") !== "desc";
    return Boolean(searchParams.get(key));
  }).length;

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
        label: t("acquisitions.filters.searchLabel"),
        value: q,
        onRemove: () => update({ q: null }),
      });
    }

    const status = searchParams.get("status");
    if (status) {
      items.push({
        key: "status",
        label: t("acquisitions.filters.status"),
        value: t(`acquisitions.status.${status}`),
        onRemove: () => update({ status: null }),
      });
    }

    if (branchId) {
      const branch = meta.data?.branches.find((item) => item.id === branchId);
      items.push({
        key: "branchId",
        label: t("acquisitions.filters.branch"),
        value: branch?.name ?? branchId,
        onRemove: () => update({ branchId: null }),
      });
    }

    const sourceType = searchParams.get("sourceType");
    if (sourceType) {
      items.push({
        key: "sourceType",
        label: t("acquisitions.filters.sourceType"),
        value: t(`acquisitions.sourceTypes.${sourceType}`),
        onRemove: () => update({ sourceType: null }),
      });
    }

    if (makeValue) {
      items.push({
        key: "make",
        label: t("acquisitions.filters.make"),
        value: makeValue,
        onRemove: () => update({ make: null, model: null }),
      });
    }

    const model = searchParams.get("model");
    if (model) {
      items.push({
        key: "model",
        label: t("acquisitions.filters.model"),
        value: model,
        onRemove: () => update({ model: null }),
      });
    }

    for (const [key, enumPath, labelKey] of [
      ["paymentStatus", "acquisitions.enums.paymentStatus", "acquisitions.filters.paymentStatus"],
      ["documentStatus", "acquisitions.enums.documentStatus", "acquisitions.filters.documentStatus"],
      [
        "registrationStatus",
        "acquisitions.enums.registrationStatus",
        "acquisitions.filters.registrationStatus",
      ],
    ] as const) {
      const value = searchParams.get(key);
      if (value) {
        items.push({
          key,
          label: t(labelKey),
          value: t(`${enumPath}.${value}`),
          onRemove: () => update({ [key]: null }),
        });
      }
    }

    const purchaseFrom = searchParams.get("purchaseDateFrom");
    const purchaseTo = searchParams.get("purchaseDateTo");
    if (purchaseFrom || purchaseTo) {
      items.push({
        key: "purchaseDate",
        label: t("acquisitions.filters.groupDates"),
        value: [purchaseFrom || "…", purchaseTo || "…"].join(" – "),
        onRemove: () => update({ purchaseDateFrom: null, purchaseDateTo: null }),
      });
    }

    const createdFrom = searchParams.get("createdFrom");
    const createdTo = searchParams.get("createdTo");
    if (createdFrom || createdTo) {
      items.push({
        key: "created",
        label: t("acquisitions.filters.createdFrom"),
        value: [createdFrom || "…", createdTo || "…"].join(" – "),
        onRemove: () => update({ createdFrom: null, createdTo: null }),
      });
    }

    if (showCost) {
      const priceMin = searchParams.get("priceMin");
      const priceMax = searchParams.get("priceMax");
      if (priceMin || priceMax) {
        items.push({
          key: "price",
          label: t("acquisitions.filters.groupPrice"),
          value: [priceMin || "…", priceMax || "…"].join(" – "),
          onRemove: () => update({ priceMin: null, priceMax: null }),
        });
      }
    }

    return items;
  }, [branchId, makeValue, meta.data?.branches, searchParams, showCost, t, update]);

  return (
    <ListFilterBar
      ariaLabel={t("acquisitions.filters.searchLabel")}
      actions={actions}
      advancedCount={advancedCount}
      basicCount={["status", "branchId"].filter((key) => Boolean(searchParams.get(key))).length}
      hasActiveFilters={hasQuery}
      onClear={clear}
      chips={chips}
      drawerTitle={t("acquisitions.filters.drawerTitle")}
      drawerDescription={t("acquisitions.filters.drawerHint")}
      search={
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <DebouncedFilterInput
            type="search"
            inputMode="search"
            aria-label={t("acquisitions.filters.searchLabel")}
            placeholder={t("acquisitions.filters.searchPlaceholder")}
            className="h-11 ps-9 md:h-10"
            value={searchParams.get("q") ?? ""}
            onCommit={(value) => update({ q: value })}
          />
        </div>
      }
      basicFilters={
        <>
          <SearchableSelect
            aria-label={t("acquisitions.filters.status")}
            value={searchParams.get("status") ?? ""}
            onValueChange={(value) => update({ status: value })}
            optional
            placeholder={t("acquisitions.filters.allStatuses")}
            options={ACQUISITION_STATUSES.map((status) => ({
              value: status,
              label: t(`acquisitions.status.${status}`),
              icon: ACQUISITION_STATUS_ICONS[status],
            }))}
          />
          <SearchableSelect
            aria-label={t("acquisitions.filters.branch")}
            value={branchId}
            onValueChange={(value) => update({ branchId: value })}
            optional
            placeholder={t("acquisitions.filters.allBranches")}
            options={(meta.data?.branches ?? []).map((branch) => ({
              value: branch.id,
              label: branch.name,
              icon: BRANCH_ICON,
            }))}
          />
        </>
      }
      drawerContent={
        <div className="grid gap-2.5">
          <FilterGroup
            title={t("acquisitions.filters.groupSource")}
            dense
            collapsible
            defaultOpen
            activeCount={
              ["sourceType", "make", "model"].filter((key) => Boolean(searchParams.get(key)))
                .length
            }
          >
            <FormField label={t("acquisitions.filters.sourceType")} htmlFor="filter-source">
              <SearchableSelect
                id="filter-source"
                value={searchParams.get("sourceType") ?? ""}
                onValueChange={(value) => update({ sourceType: value })}
                optional
                searchable={false}
                placeholder={t("acquisitions.filters.allSourceTypes")}
                options={ACQUISITION_SOURCE_TYPES.map((type) => ({
                  value: type,
                  label: t(`acquisitions.sourceTypes.${type}`),
                  icon: ACQUISITION_SOURCE_ICONS[type],
                }))}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.make")} htmlFor="filter-make">
              <SearchableSelect
                id="filter-make"
                value={makeValue}
                onValueChange={(value) => update({ make: value, model: null })}
                optional
                placeholder={t("acquisitions.filters.anyMake")}
                options={(meta.data?.makes ?? []).map((make) => ({
                  value: make.name,
                  label: make.name,
                  icon: <BrandLogo name={make.name} />,
                }))}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.model")} htmlFor="filter-model">
              <SearchableSelect
                id="filter-model"
                value={searchParams.get("model") ?? ""}
                onValueChange={(value) => update({ model: value })}
                optional
                placeholder={t("acquisitions.filters.anyModel")}
                options={modelOptions.map((model) => ({
                  value: model.name,
                  label: model.name,
                  icon: MODEL_ICON,
                }))}
              />
            </FormField>
          </FilterGroup>

          <FilterGroup
            title={t("acquisitions.filters.groupStatus")}
            dense
            collapsible
            activeCount={
              ["paymentStatus", "documentStatus", "registrationStatus"].filter((key) =>
                Boolean(searchParams.get(key)),
              ).length
            }
          >
            <FormField label={t("acquisitions.filters.paymentStatus")} htmlFor="filter-payment">
              <SearchableSelect
                id="filter-payment"
                value={searchParams.get("paymentStatus") ?? ""}
                onValueChange={(value) => update({ paymentStatus: value })}
                optional
                searchable={false}
                placeholder={t("acquisitions.filters.allPaymentStatuses")}
                options={ACQUISITION_PAYMENT_STATUSES.map((status) => ({
                  value: status,
                  label: t(`acquisitions.enums.paymentStatus.${status}`),
                  icon: ACQUISITION_PAYMENT_ICONS[status],
                }))}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.documentStatus")} htmlFor="filter-document">
              <SearchableSelect
                id="filter-document"
                value={searchParams.get("documentStatus") ?? ""}
                onValueChange={(value) => update({ documentStatus: value })}
                optional
                searchable={false}
                placeholder={t("acquisitions.filters.allDocumentStatuses")}
                options={ACQUISITION_DOCUMENT_STATUSES.map((status) => ({
                  value: status,
                  label: t(`acquisitions.enums.documentStatus.${status}`),
                  icon: ACQUISITION_DOCUMENT_ICONS[status],
                }))}
              />
            </FormField>
            <FormField
              label={t("acquisitions.filters.registrationStatus")}
              htmlFor="filter-registration"
            >
              <SearchableSelect
                id="filter-registration"
                value={searchParams.get("registrationStatus") ?? ""}
                onValueChange={(value) => update({ registrationStatus: value })}
                optional
                searchable={false}
                placeholder={t("acquisitions.filters.allRegistrationStatuses")}
                options={ACQUISITION_REGISTRATION_STATUSES.map((status) => ({
                  value: status,
                  label: t(`acquisitions.enums.registrationStatus.${status}`),
                  icon: ACQUISITION_REGISTRATION_ICONS[status],
                }))}
              />
            </FormField>
          </FilterGroup>

          <FilterGroup
            title={t("acquisitions.filters.groupDates")}
            dense
            collapsible
            activeCount={
              ["purchaseDateFrom", "purchaseDateTo", "createdFrom", "createdTo"].filter((key) =>
                Boolean(searchParams.get(key)),
              ).length
            }
          >
            <FormField
              label={t("acquisitions.filters.purchaseDateFrom")}
              htmlFor="filter-purchase-from"
            >
              <DebouncedFilterInput
                id="filter-purchase-from"
                type="date"
                className="h-11 md:h-10"
                value={searchParams.get("purchaseDateFrom") ?? ""}
                onCommit={(value) => update({ purchaseDateFrom: value })}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.purchaseDateTo")} htmlFor="filter-purchase-to">
              <DebouncedFilterInput
                id="filter-purchase-to"
                type="date"
                className="h-11 md:h-10"
                value={searchParams.get("purchaseDateTo") ?? ""}
                onCommit={(value) => update({ purchaseDateTo: value })}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.createdFrom")} htmlFor="filter-created-from">
              <DebouncedFilterInput
                id="filter-created-from"
                type="date"
                className="h-11 md:h-10"
                value={searchParams.get("createdFrom") ?? ""}
                onCommit={(value) => update({ createdFrom: value })}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.createdTo")} htmlFor="filter-created-to">
              <DebouncedFilterInput
                id="filter-created-to"
                type="date"
                className="h-11 md:h-10"
                value={searchParams.get("createdTo") ?? ""}
                onCommit={(value) => update({ createdTo: value })}
              />
            </FormField>
          </FilterGroup>

          {showCost ? (
            <FilterGroup
              title={t("acquisitions.filters.groupPrice")}
              dense
              collapsible
              activeCount={
                ["priceMin", "priceMax"].filter((key) => Boolean(searchParams.get(key))).length
              }
            >
              <FormField label={t("acquisitions.filters.priceMin")} htmlFor="filter-price-min">
                <DebouncedFilterInput
                  id="filter-price-min"
                  inputMode="decimal"
                  placeholder="0"
                  className="h-11 md:h-10"
                  value={searchParams.get("priceMin") ?? ""}
                  onCommit={(value) => update({ priceMin: value })}
                />
              </FormField>
              <FormField label={t("acquisitions.filters.priceMax")} htmlFor="filter-price-max">
                <DebouncedFilterInput
                  id="filter-price-max"
                  inputMode="decimal"
                  placeholder="500000"
                  className="h-11 md:h-10"
                  value={searchParams.get("priceMax") ?? ""}
                  onCommit={(value) => update({ priceMax: value })}
                />
              </FormField>
            </FilterGroup>
          ) : null}

          <FilterGroup
            title={t("acquisitions.filters.sort")}
            dense
            collapsible
            activeCount={
              ((searchParams.get("sort") ?? "created_at") !== "created_at" ? 1 : 0) +
              ((searchParams.get("order") ?? "desc") !== "desc" ? 1 : 0)
            }
          >
            <FormField label={t("acquisitions.filters.sort")} htmlFor="filter-sort">
              <SearchableSelect
                id="filter-sort"
                value={searchParams.get("sort") ?? "created_at"}
                onValueChange={(value) => update({ sort: value })}
                searchable={false}
                options={ACQUISITION_SORT_FIELDS.map((field) => ({
                  value: field,
                  label: t(`acquisitions.sort.${field}`),
                  icon: ACQUISITION_SORT_ICONS[field],
                }))}
              />
            </FormField>
            <FormField label={t("acquisitions.filters.order")} htmlFor="filter-order">
              <SearchableSelect
                id="filter-order"
                value={searchParams.get("order") ?? "desc"}
                onValueChange={(value) => update({ order: value })}
                searchable={false}
                options={[
                  {
                    value: "desc",
                    label: t("acquisitions.filters.desc"),
                    icon: ORDER_ICONS.desc,
                  },
                  { value: "asc", label: t("acquisitions.filters.asc"), icon: ORDER_ICONS.asc },
                ]}
              />
            </FormField>
          </FilterGroup>
        </div>
      }
    />
  );
}
