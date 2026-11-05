"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { ErrorState } from "@/components/feedback/error-state";
import { FormField } from "@/components/forms/form-field";
import { toDateInputValue } from "@/components/inventory/inventory-utils";
import {
  ACQUISITION_DOCUMENT_ICONS,
  ACQUISITION_REGISTRATION_ICONS,
  ACQUISITION_SOURCE_ICONS,
  BRANCH_ICON,
  ORIGIN_ICONS,
  acquisitionCurrencyOptions,
} from "@/components/acquisitions/acquisition-select-icons";
import { AcquisitionVehiclePicker } from "@/components/acquisitions/acquisition-vehicle-picker";
import { PhoneInput } from "@/components/forms/phone-input";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { FormSectionsSkeleton } from "@/components/feedback/skeletons";
import { Textarea } from "@/components/ui/textarea";
import { useAcquisitionMeta } from "@/hooks/use-acquisitions";
import { usePermission } from "@/hooks/use-permission";
import { useVehicle } from "@/hooks/use-vehicles";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { countrySelectOptions } from "@/lib/vehicles/countries";
import { toPrice } from "@/lib/vehicles/quantity";
import {
  acquisitionEmbeddedFormSchema,
  acquisitionFormSchema,
  type AcquisitionFormValues,
} from "@/lib/validation/acquisition";
import {
  ACQUISITION_DOCUMENT_STATUSES,
  ACQUISITION_FORM_EXPENSES,
  ACQUISITION_REGISTRATION_STATUSES,
  ACQUISITION_SOURCE_TYPES,
  type AcquisitionDetail,
  type AcquisitionExpenseType,
} from "@/types/acquisition";
import { ORIGIN_TYPES, type VehicleListItem } from "@/types/vehicle";

type AcquisitionFormInput = z.input<typeof acquisitionFormSchema>;
type AcquisitionMeta = NonNullable<ReturnType<typeof useAcquisitionMeta>["data"]>;
type VehicleSourceMode = "existing" | "new";

export type AcquisitionFormHandle = {
  /** Validate and return values, or null when invalid. */
  validate: () => Promise<AcquisitionFormValues | null>;
  isDirty: () => boolean;
  getValues: () => AcquisitionFormInput;
};

export type AcquisitionFormProps = {
  mode: "create" | "edit";
  acquisition?: AcquisitionDetail;
  submitting?: boolean;
  /** Override loading button label while submitting (e.g. uploading documents). */
  submittingLabel?: string;
  fieldErrors?: Record<string, string>;
  formError?: ReactNode;
  cancelHref?: string;
  /** Prefill create form by linking an inventory vehicle. */
  initialVehicleId?: string;
  /** Rendered directly after the Purchase section (e.g. the vehicle's selling price). */
  afterPurchase?: ReactNode;
  /** Units on the linked inventory record; price labels say "per unit" when above 1. */
  unitCount?: number;
  /** Live purchase price (per unit) and currency, for quantity totals. */
  onPurchaseChange?: (values: { purchasePrice: number | null; currency: string }) => void;
  /** Optional sections rendered after purchase fields (e.g. documents). */
  extraSections?: ReactNode;
  onSubmit?: (values: AcquisitionFormValues) => Promise<void> | void;
  /**
   * Embed inside Inventory vehicle create/edit.
   * Keeps the same acquisition fields; hides vehicle picker, branch, and submit bar.
   */
  embedded?: boolean;
  /** When embedded, sync branchId from the Inventory vehicle form. */
  branchId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<AcquisitionFormHandle | null>;
};

function formExpenseLines(
  acquisition: AcquisitionDetail | undefined,
  category: AcquisitionExpenseType,
) {
  return acquisition?.expenses?.filter((expense) => expense.expenseType === category) ?? [];
}

function formExpenseTotal(
  acquisition: AcquisitionDetail | undefined,
  category: AcquisitionExpenseType,
) {
  const lines = formExpenseLines(acquisition, category);
  return lines.length > 0 ? lines.reduce((sum, line) => sum + line.amount, 0) : null;
}

function toDefaults(
  acquisition: AcquisitionDetail | undefined,
  branchId: string,
): AcquisitionFormInput {
  if (!acquisition) {
    return {
      branchId,
      sourceType: "individual_owner",
      sourceName: "",
      sourceCompany: "",
      sourcePhone: "",
      sourceEmail: "",
      sourceReference: "",
      lotNumber: "",
      supplierId: "",
      customerId: "",
      askingPrice: "",
      purchasePrice: undefined as unknown as number,
      shippingCost: "",
      otherFees: "",
      currency: "AED",
      purchaseDate: "",
      expectedArrivalDate: "",
      paymentStatus: "not_paid",
      registrationStatus: "not_started",
      documentStatus: "pending",
      notes: "",
      vehicle: {
        vehicleId: "",
        vin: "",
        chassisNumber: "",
        make: "",
        model: "",
        variant: "",
        year: undefined as unknown as number,
        mileage: 0,
        originType: "unknown",
        countryOfOrigin: "",
        makeId: "",
        modelId: "",
      },
    };
  }

  return {
    branchId: acquisition.branchId,
    sourceType: acquisition.sourceType,
    sourceName: acquisition.sourceName ?? "",
    sourceCompany: acquisition.sourceCompany ?? "",
    sourcePhone: acquisition.sourcePhone ?? "",
    sourceEmail: acquisition.sourceEmail ?? "",
    sourceReference: acquisition.sourceReference ?? "",
    lotNumber: acquisition.lotNumber ?? "",
    supplierId: acquisition.supplierId ?? "",
    customerId: acquisition.customerId ?? "",
    askingPrice: acquisition.askingPrice ?? "",
    purchasePrice: acquisition.purchasePrice ?? (undefined as unknown as number),
    shippingCost: formExpenseTotal(acquisition, "transportation") ?? "",
    otherFees: formExpenseTotal(acquisition, "other") ?? "",
    currency: acquisition.currency || "AED",
    purchaseDate: toDateInputValue(acquisition.purchaseDate),
    expectedArrivalDate: toDateInputValue(acquisition.expectedArrivalDate),
    paymentStatus: acquisition.paymentStatus,
    registrationStatus: acquisition.registrationStatus,
    documentStatus: acquisition.documentStatus,
    notes: acquisition.notes ?? "",
    vehicle: {
      vehicleId: acquisition.vehicleId,
      vin: acquisition.vehicleVin ?? "",
      chassisNumber: "",
      make: acquisition.vehicleMake ?? "",
      model: acquisition.vehicleModel ?? "",
      variant: acquisition.vehicleVariant ?? "",
      year: acquisition.vehicleYear ?? (undefined as unknown as number),
      mileage: acquisition.vehicleMileage ?? 0,
      originType: (acquisition.vehicleOriginType as "gcc" | "imported" | "unknown") || "unknown",
      countryOfOrigin: acquisition.vehicleCountryOfOrigin ?? "",
      makeId: "",
      modelId: "",
    },
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-4 [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

function AcquisitionFormBody({
  mode,
  acquisition,
  meta,
  submitting,
  submittingLabel,
  fieldErrors,
  formError,
  cancelHref,
  initialVehicleId,
  afterPurchase,
  unitCount = 1,
  onPurchaseChange,
  extraSections,
  onSubmit,
  embedded = false,
  branchId: branchIdProp,
  onDirtyChange,
  formRef,
}: AcquisitionFormProps & {
  meta: AcquisitionMeta;
  formRef?: Ref<AcquisitionFormHandle | null>;
}) {
  const t = useTranslations();
  const { user, can } = usePermission();
  const canCreateVehicle = can("vehicle.create");
  const canViewVehicle = can("vehicle.view");

  const [vehicleMode, setVehicleMode] = useState<VehicleSourceMode>(() =>
    mode === "edit" ? "existing" : initialVehicleId || !canCreateVehicle ? "existing" : "existing",
  );
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleListItem | null>(null);

  const defaultBranch =
    branchIdProp ??
    acquisition?.branchId ??
    (user.branchId && meta.branches.some((branch) => branch.id === user.branchId)
      ? user.branchId
      : meta.branches.length === 1
        ? meta.branches[0].id
        : "");

  const form = useForm<AcquisitionFormInput, unknown, AcquisitionFormValues>({
    resolver: zodResolver(embedded ? acquisitionEmbeddedFormSchema : acquisitionFormSchema),
    defaultValues: toDefaults(acquisition, defaultBranch),
  });
  const { errors, isDirty } = form.formState;

  const sourceType = useWatch({ control: form.control, name: "sourceType" });
  const makeValue = useWatch({ control: form.control, name: "vehicle.make" });
  const linkedVehicleId = useWatch({ control: form.control, name: "vehicle.vehicleId" });
  const purchasePrice = toPrice(useWatch({ control: form.control, name: "purchasePrice" }));
  const currency = useWatch({ control: form.control, name: "currency" }) ?? "AED";

  useEffect(() => {
    onPurchaseChange?.({ purchasePrice, currency });
  }, [onPurchaseChange, purchasePrice, currency]);

  // Mirrors the expense permissions syncFormExpenses checks on the server.
  const canEditFees =
    can("acquisition.expense.create") ||
    can("acquisition.expense.edit") ||
    can("acquisition.cost.edit") ||
    can("vehicle.cost.edit");
  // Editing needs the current lines, which are only loaded for users who can view expenses.
  const showFees = canEditFees && (mode === "create" || acquisition?.expenses !== undefined);

  const perUnit = (label: string) =>
    unitCount > 1 ? t("inventory.quantity.perUnitLabel", { label }) : label;

  const prefillVehicle = useVehicle(
    mode === "create" && initialVehicleId ? initialVehicleId : "",
  );

  useEffect(() => {
    if (!fieldErrors) return;
    for (const [key, message] of Object.entries(fieldErrors)) {
      form.setError(key as keyof AcquisitionFormInput, { type: "server", message });
    }
  }, [fieldErrors, form]);

  useEffect(() => {
    if (embedded) return;
    if (mode !== "create" || !initialVehicleId || !prefillVehicle.data) return;
    const vehicle = prefillVehicle.data;
    applyExistingVehicle(vehicle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time prefill from URL
  }, [mode, initialVehicleId, prefillVehicle.data?.id, embedded]);

  useEffect(() => {
    if (!embedded || !branchIdProp) return;
    if (meta.branches.some((branch) => branch.id === branchIdProp)) {
      form.setValue("branchId", branchIdProp, { shouldDirty: false });
    }
  }, [embedded, branchIdProp, form, meta.branches]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function enrichSubmitValues(values: AcquisitionFormValues): AcquisitionFormValues {
    const makeName = values.vehicle.make?.trim() ?? "";
    const modelName = values.vehicle.model?.trim() ?? "";
    const make = meta.makes.find((item) => item.name.toLowerCase() === makeName.toLowerCase());
    const model = make
      ? meta.models.find(
          (item) =>
            item.makeId === make.id && item.name.toLowerCase() === modelName.toLowerCase(),
        )
      : undefined;
    return {
      ...values,
      vehicle: {
        ...values.vehicle,
        make: makeName,
        model: modelName,
        makeId: make?.id ?? null,
        modelId: model?.id ?? null,
      },
    };
  }

  useImperativeHandle(formRef, () => ({
    validate: () =>
      new Promise((resolve) => {
        void form.handleSubmit(
          (values) => resolve(enrichSubmitValues(values)),
          () => resolve(null),
        )();
      }),
    isDirty: () => form.formState.isDirty,
    getValues: () => form.getValues(),
  }));

  function applyExistingVehicle(vehicle: VehicleListItem) {
    setVehicleMode("existing");
    setSelectedVehicle(vehicle);
    form.setValue("vehicle.vehicleId", vehicle.id, { shouldDirty: true });
    form.setValue("vehicle.vin", vehicle.vin ?? "", { shouldDirty: true });
    form.setValue("vehicle.chassisNumber", vehicle.chassisNumber ?? "", { shouldDirty: true });
    form.setValue("vehicle.make", vehicle.make, { shouldDirty: true });
    form.setValue("vehicle.model", vehicle.model, { shouldDirty: true });
    form.setValue("vehicle.variant", vehicle.variant ?? "", { shouldDirty: true });
    form.setValue("vehicle.year", vehicle.year, { shouldDirty: true });
    form.setValue("vehicle.mileage", vehicle.mileage, { shouldDirty: true });
    form.setValue(
      "vehicle.originType",
      (vehicle.originType as "gcc" | "imported" | "unknown") || "unknown",
      { shouldDirty: true },
    );
    if (meta.branches.some((branch) => branch.id === vehicle.branchId)) {
      form.setValue("branchId", vehicle.branchId, { shouldDirty: true });
    }
  }

  function clearExistingVehicle() {
    setSelectedVehicle(null);
    form.setValue("vehicle.vehicleId", "", { shouldDirty: true });
    form.setValue("vehicle.vin", "");
    form.setValue("vehicle.chassisNumber", "");
    form.setValue("vehicle.make", "");
    form.setValue("vehicle.model", "");
    form.setValue("vehicle.variant", "");
    form.setValue("vehicle.year", undefined as unknown as number);
    form.setValue("vehicle.mileage", 0);
    form.setValue("vehicle.originType", "unknown");
    form.setValue("vehicle.countryOfOrigin", "");
  }

  function switchVehicleMode(next: VehicleSourceMode) {
    if (next === vehicleMode) return;
    if (next === "new" && !canCreateVehicle) return;
    setVehicleMode(next);
    if (next === "new") {
      clearExistingVehicle();
    } else {
      clearExistingVehicle();
    }
  }

  const selectedMake = meta.makes.find(
    (make) => make.name.toLowerCase() === (makeValue ?? "").trim().toLowerCase(),
  );
  const modelSuggestions = selectedMake
    ? meta.models.filter((model) => model.makeId === selectedMake.id)
    : [];

  const showAuctionFields = sourceType === "auction";
  const showCompanyFields =
    sourceType === "dealer" ||
    sourceType === "fleet" ||
    sourceType === "importer" ||
    sourceType === "company" ||
    sourceType === "broker";
  const showIndividualFields =
    sourceType === "individual_owner" || sourceType === "trade_in" || sourceType === "other";
  const showNewVehicleFields = mode === "create" && vehicleMode === "new";
  const vehicleFieldsLocked = mode === "edit" || (mode === "create" && vehicleMode === "existing");

  function vehicleError(name: keyof AcquisitionFormInput["vehicle"]) {
    return errors.vehicle?.[name]?.message as string | undefined;
  }

  function fieldError(name: keyof AcquisitionFormInput) {
    return errors[name]?.message as string | undefined;
  }

  function selectField(
    name: keyof AcquisitionFormInput,
    label: string,
    options: SearchableSelectOption[],
    config: {
      nullable?: boolean;
      optional?: boolean;
      placeholder?: string;
      searchable?: boolean;
      disabled?: boolean;
      required?: boolean;
    } = {},
  ) {
    const optional = config.optional ?? config.nullable ?? config.placeholder !== undefined;
    return (
      <FormField
        label={label}
        htmlFor={name}
        error={fieldError(name)}
        required={config.required ?? !optional}
      >
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <SearchableSelect
              id={name}
              value={field.value == null ? "" : String(field.value)}
              onValueChange={(next) => {
                field.onChange(config.nullable ? (next === "" ? null : next) : next);
              }}
              options={options}
              optional={optional}
              searchable={config.searchable}
              placeholder={config.placeholder}
              disabled={config.disabled}
              aria-invalid={errors[name] ? true : undefined}
            />
          )}
        />
      </FormField>
    );
  }

  const formBody = (
    <>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {!embedded ? (
      <Section title={t("acquisitions.sections.vehicle")}>
        {mode === "create" ? (
            <div className="sm:col-span-2 lg:col-span-3 grid gap-3">
            <div
              className="bg-muted/40 grid gap-2 rounded-xl border p-2 sm:grid-cols-2"
              role="group"
              aria-label={t("acquisitions.vehiclePicker.modeLabel")}
            >
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  vehicleMode === "existing"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:bg-background/60",
                )}
                aria-pressed={vehicleMode === "existing"}
                onClick={() => switchVehicleMode("existing")}
              >
                {t("acquisitions.vehiclePicker.useExisting")}
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  vehicleMode === "new"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:bg-background/60",
                  !canCreateVehicle && "cursor-not-allowed opacity-50",
                )}
                aria-pressed={vehicleMode === "new"}
                disabled={!canCreateVehicle}
                onClick={() => switchVehicleMode("new")}
              >
                {t("acquisitions.vehiclePicker.createNew")}
              </button>
            </div>

            {vehicleMode === "existing" ? (
              <FormField
                label={t("acquisitions.vehiclePicker.selectExisting")}
                htmlFor="acquisition-vehicle-picker"
                error={
                  vehicleError("vehicleId") ||
                  (!linkedVehicleId && errors.vehicle?.make?.message
                    ? t("acquisitions.vehiclePicker.required")
                    : undefined)
                }
                hint={
                  canViewVehicle
                    ? t("acquisitions.vehiclePicker.hint")
                    : t("acquisitions.vehiclePicker.noVehicleView")
                }
              >
                {canViewVehicle ? (
                  <AcquisitionVehiclePicker
                    id="acquisition-vehicle-picker"
                    value={linkedVehicleId || null}
                    selected={selectedVehicle}
                    disabled={Boolean(submitting)}
                    aria-invalid={errors.vehicle?.vehicleId ? true : undefined}
                    onSelect={applyExistingVehicle}
                    onClear={clearExistingVehicle}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t("acquisitions.vehiclePicker.noVehicleView")}
                  </p>
                )}
              </FormField>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("acquisitions.vehiclePicker.createNewHint")}
              </p>
            )}
          </div>
        ) : null}

        {mode === "edit" && acquisition?.vehicleStockNumber ? (
          <FormField label={t("acquisitions.fields.stockNumber")} htmlFor="stockNumber">
            <Input
              id="stockNumber"
              readOnly
              disabled
              className="h-11 md:h-10"
              value={acquisition.vehicleStockNumber}
            />
          </FormField>
        ) : null}

        {showNewVehicleFields || mode === "edit" ? (
          <>
            <FormField
              label={t("acquisitions.fields.vin")}
              htmlFor="vehicle.vin"
              error={vehicleError("vin")}
              hint={t("acquisitions.fields.vinHint")}
            >
              <Input
                id="vehicle.vin"
                className="h-11 font-mono uppercase md:h-10"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={vehicleFieldsLocked && mode === "edit"}
                aria-invalid={errors.vehicle?.vin ? true : undefined}
                {...form.register("vehicle.vin")}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.chassis")}
              htmlFor="vehicle.chassisNumber"
              error={vehicleError("chassisNumber")}
            >
              <Input
                id="vehicle.chassisNumber"
                className="h-11 font-mono uppercase md:h-10"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={vehicleFieldsLocked && mode === "edit"}
                aria-invalid={errors.vehicle?.chassisNumber ? true : undefined}
                {...form.register("vehicle.chassisNumber")}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.brand")}
              htmlFor="vehicle.make"
              error={vehicleError("make")}
            >
              <Input
                id="vehicle.make"
                list="acquisition-makes"
                className="h-11 md:h-10"
                autoComplete="off"
                disabled={vehicleFieldsLocked && mode === "edit"}
                aria-invalid={errors.vehicle?.make ? true : undefined}
                {...form.register("vehicle.make")}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.model")}
              htmlFor="vehicle.model"
              error={vehicleError("model")}
            >
              <Input
                id="vehicle.model"
                list="acquisition-models"
                className="h-11 md:h-10"
                autoComplete="off"
                disabled={vehicleFieldsLocked && mode === "edit"}
                aria-invalid={errors.vehicle?.model ? true : undefined}
                {...form.register("vehicle.model")}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.variant")}
              htmlFor="vehicle.variant"
              error={vehicleError("variant")}
            >
              <Input
                id="vehicle.variant"
                className="h-11 md:h-10"
                autoComplete="off"
                disabled={vehicleFieldsLocked && mode === "edit"}
                {...form.register("vehicle.variant")}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.year")}
              htmlFor="vehicle.year"
              error={vehicleError("year")}
            >
              <Input
                id="vehicle.year"
                type="number"
                inputMode="numeric"
                className="h-11 md:h-10"
                disabled={vehicleFieldsLocked && mode === "edit"}
                aria-invalid={errors.vehicle?.year ? true : undefined}
                {...form.register("vehicle.year", { valueAsNumber: true })}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.mileage")}
              htmlFor="vehicle.mileage"
              error={vehicleError("mileage")}
            >
              <Input
                id="vehicle.mileage"
                type="number"
                inputMode="numeric"
                className="h-11 md:h-10"
                disabled={vehicleFieldsLocked && mode === "edit"}
                aria-invalid={errors.vehicle?.mileage ? true : undefined}
                {...form.register("vehicle.mileage", { valueAsNumber: true })}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.origin")}
              htmlFor="vehicle.originType"
              error={vehicleError("originType")}
            >
              <Controller
                control={form.control}
                name="vehicle.originType"
                render={({ field }) => (
                  <SearchableSelect
                    id="vehicle.originType"
                    value={field.value == null ? "" : String(field.value)}
                    onValueChange={field.onChange}
                    searchable={false}
                    disabled={vehicleFieldsLocked && mode === "edit"}
                    options={ORIGIN_TYPES.map((type) => ({
                      value: type,
                      label: t(`inventory.enums.origin.${type}`),
                      icon: ORIGIN_ICONS[type],
                    }))}
                  />
                )}
              />
            </FormField>
            <FormField
              label={t("acquisitions.fields.countryOfOrigin")}
              htmlFor="vehicle.countryOfOrigin"
              error={vehicleError("countryOfOrigin")}
            >
              <Controller
                control={form.control}
                name="vehicle.countryOfOrigin"
                render={({ field }) => (
                  <SearchableSelect
                    id="vehicle.countryOfOrigin"
                    value={field.value ?? ""}
                    onValueChange={(next) => field.onChange(next === "" ? null : next)}
                    optional
                    disabled={vehicleFieldsLocked && mode === "edit"}
                    placeholder={t("acquisitions.fields.selectPlaceholder")}
                    options={countrySelectOptions(acquisition?.vehicleCountryOfOrigin)}
                    groupLabel={(group) => t(`inventory.enums.countryRegion.${group}`)}
                  />
                )}
              />
            </FormField>
            <datalist id="acquisition-makes">
              {meta.makes.map((make) => (
                <option key={make.id} value={make.name} />
              ))}
            </datalist>
            <datalist id="acquisition-models">
              {modelSuggestions.map((model) => (
                <option key={model.id} value={model.name} />
              ))}
            </datalist>
          </>
        ) : null}
      </Section>
      ) : null}

      <Section title={t("acquisitions.sections.source")}>
        {!embedded
          ? selectField(
              "branchId",
              t("acquisitions.fields.branch"),
              meta.branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
                icon: BRANCH_ICON,
              })),
              {
                placeholder: t("acquisitions.fields.selectPlaceholder"),
                optional: false,
                disabled: Boolean(linkedVehicleId),
              },
            )
          : null}
        {selectField(
          "sourceType",
          t("acquisitions.fields.sourceType"),
          ACQUISITION_SOURCE_TYPES.map((type) => ({
            value: type,
            label: t(`acquisitions.sourceTypes.${type}`),
            icon: ACQUISITION_SOURCE_ICONS[type],
          })),
          { searchable: false, optional: false },
        )}
        {(showIndividualFields || showAuctionFields || showCompanyFields) && (
          <FormField
            label={t("acquisitions.fields.sourceName")}
            htmlFor="sourceName"
            error={fieldError("sourceName")}
            required={showIndividualFields || showAuctionFields}
          >
            <Input
              id="sourceName"
              className="h-11 md:h-10"
              autoComplete="off"
              aria-invalid={errors.sourceName ? true : undefined}
              {...form.register("sourceName")}
            />
          </FormField>
        )}
        {showCompanyFields || showAuctionFields ? (
          <FormField
            label={t("acquisitions.fields.sourceCompany")}
            htmlFor="sourceCompany"
            error={fieldError("sourceCompany")}
          >
            <Input
              id="sourceCompany"
              className="h-11 md:h-10"
              autoComplete="off"
              {...form.register("sourceCompany")}
            />
          </FormField>
        ) : null}
        <FormField
          label={t("acquisitions.fields.sourcePhone")}
          htmlFor="sourcePhone"
          error={fieldError("sourcePhone")}
        >
          <Controller
            control={form.control}
            name="sourcePhone"
            render={({ field }) => (
              <PhoneInput
                id="sourcePhone"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={Boolean(errors.sourcePhone)}
              />
            )}
          />
        </FormField>
        <FormField
          label={t("acquisitions.fields.sourceEmail")}
          htmlFor="sourceEmail"
          error={fieldError("sourceEmail")}
        >
          <Input
            id="sourceEmail"
            type="email"
            className="h-11 md:h-10"
            autoComplete="off"
            aria-invalid={errors.sourceEmail ? true : undefined}
            {...form.register("sourceEmail")}
          />
        </FormField>
        <FormField
          label={t("acquisitions.fields.sourceReference")}
          htmlFor="sourceReference"
          error={fieldError("sourceReference")}
        >
          <Input
            id="sourceReference"
            className="h-11 md:h-10"
            autoComplete="off"
            {...form.register("sourceReference")}
          />
        </FormField>
        {showAuctionFields ? (
          <FormField
            label={t("acquisitions.fields.lotNumber")}
            htmlFor="lotNumber"
            error={fieldError("lotNumber")}
          >
            <Input
              id="lotNumber"
              className="h-11 md:h-10"
              autoComplete="off"
              {...form.register("lotNumber")}
            />
          </FormField>
        ) : null}
      </Section>

      <Section title={t("acquisitions.sections.purchase")}>
        {/* The Inventory steps leave out the seller's asking price; a saved one is kept. */}
        {!embedded ? (
          <FormField
            label={perUnit(t("acquisitions.fields.askingPrice"))}
            htmlFor="askingPrice"
            error={fieldError("askingPrice")}
          >
            <Input
              id="askingPrice"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="h-11 md:h-10"
              {...form.register("askingPrice")}
            />
          </FormField>
        ) : null}
        <FormField
          label={perUnit(t("acquisitions.fields.purchasePrice"))}
          htmlFor="purchasePrice"
          error={fieldError("purchasePrice")}
          required
        >
          <Input
            id="purchasePrice"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="h-11 md:h-10"
            aria-invalid={errors.purchasePrice ? true : undefined}
            {...form.register("purchasePrice")}
          />
        </FormField>
        {showFees
          ? ACQUISITION_FORM_EXPENSES.map(({ field, category }) => {
              // Several lines of one type are edited line by line in the Expenses tab.
              const managedInExpenses = formExpenseLines(acquisition, category).length > 1;
              return (
                <FormField
                  key={field}
                  label={t(`acquisitions.fields.${field}`)}
                  htmlFor={field}
                  error={fieldError(field)}
                  hint={managedInExpenses ? t("acquisitions.fields.feesInExpenses") : undefined}
                >
                  <Input
                    id={field}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="h-11 md:h-10"
                    disabled={managedInExpenses}
                    aria-invalid={errors[field] ? true : undefined}
                    {...form.register(field)}
                  />
                </FormField>
              );
            })
          : null}
        <FormField
          label={t("acquisitions.fields.currency")}
          htmlFor="currency"
          error={fieldError("currency")}
          required
        >
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <SearchableSelect
                id="currency"
                value={field.value ?? "AED"}
                onValueChange={field.onChange}
                searchable={false}
                options={acquisitionCurrencyOptions()}
                aria-invalid={errors.currency ? true : undefined}
              />
            )}
          />
        </FormField>
        <FormField
          label={t("acquisitions.fields.purchaseDate")}
          htmlFor="purchaseDate"
          error={fieldError("purchaseDate")}
        >
          <Input
            id="purchaseDate"
            type="date"
            className="h-11 md:h-10"
            {...form.register("purchaseDate")}
          />
        </FormField>
        <FormField
          label={t("acquisitions.fields.expectedArrivalDate")}
          htmlFor="expectedArrivalDate"
          error={fieldError("expectedArrivalDate")}
        >
          <Input
            id="expectedArrivalDate"
            type="date"
            className="h-11 md:h-10"
            aria-invalid={errors.expectedArrivalDate ? true : undefined}
            {...form.register("expectedArrivalDate")}
          />
        </FormField>
        {selectField(
          "documentStatus",
          t("acquisitions.fields.documentStatus"),
          ACQUISITION_DOCUMENT_STATUSES.map((status) => ({
            value: status,
            label: t(`acquisitions.enums.documentStatus.${status}`),
            icon: ACQUISITION_DOCUMENT_ICONS[status],
          })),
          { searchable: false, optional: false },
        )}
        {selectField(
          "registrationStatus",
          t("acquisitions.fields.registrationStatus"),
          ACQUISITION_REGISTRATION_STATUSES.map((status) => ({
            value: status,
            label: t(`acquisitions.enums.registrationStatus.${status}`),
            icon: ACQUISITION_REGISTRATION_ICONS[status],
          })),
          { searchable: false, optional: false },
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <FormField
            label={t("acquisitions.fields.notes")}
            htmlFor="notes"
            error={fieldError("notes")}
          >
            <Textarea id="notes" rows={4} className="min-h-24" {...form.register("notes")} />
          </FormField>
        </div>
      </Section>

      {afterPurchase}

      {extraSections}

      {!embedded ? (
      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky bottom-0 z-10 -mx-1 border-t px-1 py-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground min-h-5 text-xs">
            {mode === "edit" && !isDirty && !submitting
              ? t("acquisitions.actions.noChangesHint")
              : null}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link
              href={cancelHref ?? "/inventory"}
              className={cn(buttonVariants({ variant: "outline" }), "h-11 sm:h-9")}
            >
              {t("acquisitions.actions.cancel")}
            </Link>
            <LoadingButton
              type="submit"
              variant="brand"
              className="h-11 sm:h-9"
              loading={submitting}
              disabled={mode === "edit" && !isDirty}
              title={
                mode === "edit" && !isDirty
                  ? t("acquisitions.actions.noChangesHint")
                  : undefined
              }
            >
              {submitting
                ? (submittingLabel ?? t("acquisitions.actions.updating"))
                : mode === "create"
                  ? t("acquisitions.actions.createSubmit")
                  : t("acquisitions.actions.updateSubmit")}
            </LoadingButton>
          </div>
        </div>
      </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="grid gap-4">{formBody}</div>;
  }

  return (
    <form
      className="grid gap-6 pb-24"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        await onSubmit?.(enrichSubmitValues(values));
      })}
    >
      {formBody}
    </form>
  );
}

export function AcquisitionForm({ ref, ...props }: AcquisitionFormProps) {
  const t = useTranslations();
  const meta = useAcquisitionMeta();

  if (meta.isPending) {
    return (
      <FormSectionsSkeleton />
    );
  }

  if (meta.isError) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">{t("acquisitions.form.metaFailed")}</p>
        <ErrorState onRetry={() => void meta.refetch()} />
      </div>
    );
  }

  return <AcquisitionFormBody {...props} meta={meta.data} formRef={ref} />;
}
