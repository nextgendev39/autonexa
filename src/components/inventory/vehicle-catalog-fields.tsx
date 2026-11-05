"use client";

import { CalendarIcon, CarIcon, PencilLineIcon, Settings2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Control, UseFormSetValue } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { FUEL_ICONS, bodyTypeIcon } from "@/components/inventory/vehicle-select-icons";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  useCatalogModels,
  useCatalogVariants,
  useCatalogYears,
} from "@/hooks/use-vehicle-catalog";
import type { vehicleFormSchema } from "@/lib/validation/vehicle";
import { CUSTOM_VARIANT_VALUE, type MakeOption } from "@/types/vehicle";

type FormInput = z.input<typeof vehicleFormSchema>;

type CatalogRows<T extends (id: string | null) => { data?: unknown }> = NonNullable<ReturnType<T>["data"]>;
const NO_MODELS: CatalogRows<typeof useCatalogModels> = [];
const NO_YEARS: CatalogRows<typeof useCatalogYears> = [];
const NO_VARIANTS: CatalogRows<typeof useCatalogVariants> = [];

type Props = {
  control: Control<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  makes: MakeOption[];
  errors: Partial<Record<keyof FormInput, { message?: string }>>;
  initialCustomVariant?: boolean;
};

function optionLabel(name: string, nameAr?: string | null) {
  return nameAr ? `${name} · ${nameAr}` : name;
}

export function VehicleCatalogFields({
  control,
  setValue,
  makes,
  errors,
  initialCustomVariant = false,
}: Props) {
  const t = useTranslations();
  const makeId = useWatch({ control, name: "makeId" }) || "";
  const modelId = useWatch({ control, name: "modelId" }) || "";
  const modelYearId = useWatch({ control, name: "modelYearId" }) || "";
  const variantId = useWatch({ control, name: "variantId" }) || "";
  const customVariant = useWatch({ control, name: "customVariant" }) || "";
  const [customMode, setCustomMode] = useState(initialCustomVariant);

  const modelsQuery = useCatalogModels(makeId || null);
  const yearsQuery = useCatalogYears(modelId || null);
  const variantsQuery = useCatalogVariants(modelYearId || null);

  // Stable fallbacks: a new [] each render would re-run the effects below while loading.
  const models = modelsQuery.data ?? NO_MODELS;
  const years = yearsQuery.data ?? NO_YEARS;
  const variants = variantsQuery.data ?? NO_VARIANTS;

  const isCustomVariant = customMode || (Boolean(customVariant) && !variantId);

  useEffect(() => {
    if (!makeId) return;
    const make = makes.find((item) => item.id === makeId);
    if (make) setValue("make", make.name, { shouldDirty: false });
  }, [makeId, makes, setValue]);

  useEffect(() => {
    if (!modelId) return;
    const model = models.find((item) => item.id === modelId);
    if (model) setValue("model", model.name, { shouldDirty: false });
  }, [modelId, models, setValue]);

  // Link legacy inventory rows that have model text but no model_id yet.
  const modelValue = useWatch({ control, name: "model" });
  useEffect(() => {
    if (modelId || !makeId || !modelValue || models.length === 0) return;
    const match = models.find(
      (item) => item.name.toLowerCase() === String(modelValue).trim().toLowerCase(),
    );
    if (match) setValue("modelId", match.id, { shouldDirty: false });
  }, [modelId, makeId, modelValue, models, setValue]);

  const yearValue = useWatch({ control, name: "year" });

  useEffect(() => {
    if (!modelYearId) return;
    const year = years.find((item) => item.id === modelYearId);
    if (year) setValue("year", year.year, { shouldDirty: false });
  }, [modelYearId, years, setValue]);

  // Link legacy inventory rows that have year text but no model_year_id yet.
  useEffect(() => {
    if (modelYearId || !modelId || !yearValue || years.length === 0) return;
    const match = years.find((item) => item.year === Number(yearValue));
    if (match) setValue("modelYearId", match.id, { shouldDirty: false });
  }, [modelYearId, modelId, yearValue, years, setValue]);

  useEffect(() => {
    if (!variantId) return;
    const variant = variants.find((item) => item.id === variantId);
    if (!variant) return;
    setValue("variant", variant.name, { shouldDirty: false });
    setValue("customVariant", "", { shouldDirty: false });
    if (variant.bodyType) setValue("bodyType", variant.bodyType, { shouldDirty: true });
    if (variant.transmission) setValue("transmission", variant.transmission, { shouldDirty: true });
    if (variant.fuelType) setValue("fuelType", variant.fuelType, { shouldDirty: true });
    if (variant.drivetrain) setValue("driveType", variant.drivetrain, { shouldDirty: true });
    if (variant.seatingCapacity != null) {
      setValue("seats", variant.seatingCapacity, { shouldDirty: true });
    }
    if (variant.engine) setValue("engineSize", variant.engine, { shouldDirty: true });
  }, [variantId, variants, setValue]);

  function clearFromModel() {
    setValue("modelId", "");
    setValue("model", "");
    setValue("modelYearId", "");
    setValue("year", undefined as unknown as number);
    setValue("variantId", "");
    setValue("variant", "");
    setValue("customVariant", "");
  }

  function clearFromYear() {
    setValue("modelYearId", "");
    setValue("year", undefined as unknown as number);
    setValue("variantId", "");
    setValue("variant", "");
    setValue("customVariant", "");
  }

  function clearVariant() {
    setValue("variantId", "");
    setValue("variant", "");
    setValue("customVariant", "");
    setCustomMode(false);
  }

  const variantOptions = [
    // The fuel icon tells petrol, hybrid and electric trims apart at a glance.
    ...variants.map((variant) => ({
      value: variant.id,
      label: optionLabel(variant.name, variant.nameAr),
      icon: variant.fuelType ? FUEL_ICONS[variant.fuelType] : <Settings2Icon />,
    })),
    {
      value: CUSTOM_VARIANT_VALUE,
      label: t("inventory.fields.customVariantOption"),
      icon: <PencilLineIcon />,
    },
  ];

  return (
    <>
      <FormField
        label={t("inventory.fields.brand")}
        htmlFor="makeId"
        error={errors.makeId?.message ?? errors.make?.message}
        required
      >
        <Controller
          control={control}
          name="makeId"
          render={({ field }) => (
            <SearchableSelect
              id="makeId"
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                clearFromModel();
                if (!next) {
                  setValue("make", "");
                  return;
                }
                const make = makes.find((item) => item.id === next);
                setValue("make", make?.name ?? "");
              }}
              options={makes.map((make) => ({
                value: make.id,
                label: optionLabel(make.name, make.nameAr),
                icon: <BrandLogo name={make.name} />,
              }))}
              searchPlaceholder={t("inventory.fields.searchBrand")}
              placeholder={t("inventory.fields.selectPlaceholder")}
              optional={false}
              aria-invalid={errors.makeId || errors.make ? true : undefined}
            />
          )}
        />
      </FormField>

      <FormField
        label={t("inventory.fields.model")}
        htmlFor="modelId"
        error={errors.modelId?.message ?? errors.model?.message}
        required
      >
        <Controller
          control={control}
          name="modelId"
          render={({ field }) => (
            <SearchableSelect
              id="modelId"
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                clearFromYear();
                if (!next) {
                  setValue("model", "");
                  return;
                }
                const model = models.find((item) => item.id === next);
                setValue("model", model?.name ?? "");
              }}
              options={models.map((model) => ({
                value: model.id,
                label: optionLabel(model.name, model.nameAr),
                // Body shape (sedan, SUV, pickup…) when the catalog knows it.
                icon: model.vehicleType ? bodyTypeIcon(model.vehicleType) : <CarIcon />,
              }))}
              searchPlaceholder={t("inventory.fields.searchModel")}
              placeholder={t("inventory.fields.selectPlaceholder")}
              optional={false}
              disabled={!makeId}
              aria-invalid={errors.modelId || errors.model ? true : undefined}
            />
          )}
        />
      </FormField>

      <FormField
        label={t("inventory.fields.year")}
        htmlFor="modelYearId"
        error={errors.modelYearId?.message ?? errors.year?.message}
        required
      >
        <Controller
          control={control}
          name="modelYearId"
          render={({ field }) => (
            <SearchableSelect
              id="modelYearId"
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                clearVariant();
                if (!next) {
                  setValue("year", undefined as unknown as number);
                  return;
                }
                const year = years.find((item) => item.id === next);
                if (year) setValue("year", year.year);
              }}
              options={years.map((year) => ({
                value: year.id,
                label: String(year.year),
                icon: <CalendarIcon />,
              }))}
              searchPlaceholder={t("inventory.fields.searchYear")}
              placeholder={t("inventory.fields.selectPlaceholder")}
              optional={false}
              disabled={!modelId}
              aria-invalid={errors.modelYearId || errors.year ? true : undefined}
            />
          )}
        />
      </FormField>

      <FormField
        label={t("inventory.fields.variant")}
        htmlFor="variantId"
        error={errors.variantId?.message ?? errors.variant?.message}
      >
        <Controller
          control={control}
          name="variantId"
          render={({ field }) => (
            <SearchableSelect
              id="variantId"
              value={isCustomVariant ? CUSTOM_VARIANT_VALUE : (field.value ?? "")}
              onValueChange={(next) => {
                if (next === CUSTOM_VARIANT_VALUE) {
                  field.onChange("");
                  setValue("variantId", "");
                  setValue("variant", "");
                  setCustomMode(true);
                  return;
                }
                setCustomMode(false);
                field.onChange(next);
                setValue("customVariant", "");
                const variant = variants.find((item) => item.id === next);
                setValue("variant", variant?.name ?? "");
              }}
              options={variantOptions}
              searchPlaceholder={t("inventory.fields.searchVariant")}
              placeholder={t("inventory.fields.selectPlaceholder")}
              optional
              disabled={!modelYearId}
              aria-invalid={errors.variantId || errors.variant ? true : undefined}
            />
          )}
        />
      </FormField>

      {isCustomVariant ? (
        <FormField
          label={t("inventory.fields.customVariant")}
          htmlFor="customVariant"
          error={errors.customVariant?.message}
        >
          <Controller
            control={control}
            name="customVariant"
            render={({ field }) => (
              <Input
                id="customVariant"
                className="h-11 md:h-10"
                value={field.value ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  field.onChange(value);
                  setValue("variantId", "");
                  setValue("variant", value.trim() || null);
                }}
                placeholder={t("inventory.fields.customVariantPlaceholder")}
                autoComplete="off"
              />
            )}
          />
        </FormField>
      ) : null}
    </>
  );
}
