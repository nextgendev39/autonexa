"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { usePermission } from "@/hooks/use-permission";
import { usePricingMutations } from "@/hooks/use-pricing";
import {
  calculatePricingPreview,
  maxDiscountPercentFrom,
  parseMoneyInput,
  upsertPricingSchema,
  type UpsertPricingValues,
} from "@/lib/validation/pricing";
import { formatCurrency } from "@/lib/utils/currency";
import { PRICING_CHANGE_REASONS } from "@/types/pricing";
import type { VehiclePricingDetail } from "@/types/pricing";

const moneyFieldOptions = {
  setValueAs: (value: unknown) => parseMoneyInput(value),
} as const;

export function PricingForm({
  detail,
  onDone,
}: {
  detail: VehiclePricingDetail;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { can } = usePermission();
  const { upsert } = usePricingMutations(detail.vehicle.id);
  const canOverride = can("pricing.override_minimum");
  const totalCost = detail.profitability.totalVehicleCost ?? 0;

  const form = useForm<UpsertPricingValues>({
    resolver: zodResolver(upsertPricingSchema) as never,
    defaultValues: {
      minimumSellingPrice: detail.pricing?.minimumSellingPrice ?? null,
      targetSellingPrice: detail.pricing?.targetSellingPrice ?? null,
      maximumDiscountAmount: detail.pricing?.maximumDiscountAmount ?? null,
      maximumDiscountPercent: detail.pricing?.maximumDiscountPercent ?? null,
      pricingNotes: detail.pricing?.pricingNotes ?? "",
      changeReason: "other",
      changeNotes: "",
      overrideMinimum: false,
      overrideReason: "",
      submitForApproval: false,
    },
  });

  useEffect(() => {
    form.reset({
      minimumSellingPrice: detail.pricing?.minimumSellingPrice ?? null,
      targetSellingPrice: detail.pricing?.targetSellingPrice ?? null,
      maximumDiscountAmount: detail.pricing?.maximumDiscountAmount ?? null,
      maximumDiscountPercent: detail.pricing?.maximumDiscountPercent ?? null,
      pricingNotes: detail.pricing?.pricingNotes ?? "",
      changeReason: "other",
      changeNotes: "",
      overrideMinimum: false,
      overrideReason: "",
      submitForApproval: false,
    });
  }, [detail, form]);


  const watchedMinimum = useWatch({ control: form.control, name: "minimumSellingPrice" });
  const watchedTarget = useWatch({ control: form.control, name: "targetSellingPrice" });
  const watchedDiscount = useWatch({ control: form.control, name: "maximumDiscountAmount" });
  const watchedOverride = useWatch({ control: form.control, name: "overrideMinimum" });
  const discountPercent = maxDiscountPercentFrom(watchedDiscount, watchedTarget);

  // The target is the car's selling price, so profit and margin are previewed from it.
  const preview = calculatePricingPreview({
    totalVehicleCost: totalCost,
    currentSellingPrice: parseMoneyInput(watchedTarget),
    minimumSellingPrice: parseMoneyInput(watchedMinimum),
  });

  const { errors } = form.formState;
  // Pricing messages aren't auto-translated by FormField (only validation.* keys are).
  const errorText = (message?: string) =>
    message?.startsWith("pricing.") ? t(message as Parameters<typeof t>[0]) : message;
  const money = (value: number | null) =>
    value == null ? "—" : formatCurrency(value, locale);

  async function submit(values: UpsertPricingValues) {
    try {
      const belowMin =
        values.targetSellingPrice != null &&
        values.minimumSellingPrice != null &&
        values.targetSellingPrice < values.minimumSellingPrice;

      await upsert.mutateAsync({
        ...values,
        // Target is the car's selling price: current mirrors it (the list, bookings and
        // profitability read current), and advertised price is no longer used.
        advertisedPrice: null,
        currentSellingPrice: values.targetSellingPrice,
        maximumDiscountPercent: maxDiscountPercentFrom(values.maximumDiscountAmount, values.targetSellingPrice),
        overrideMinimum: belowMin ? Boolean(values.overrideMinimum) : false,
        submitForApproval: belowMin && !values.overrideMinimum ? true : values.submitForApproval,
      });
      toast.success(t("pricing.toasts.saved"));
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pricing.toasts.error"));
    }
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("pricing.fields.minimum")}
          htmlFor="pricing-min"
          error={errorText(errors.minimumSellingPrice?.message)}
        >
          <Input
            id="pricing-min"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            {...form.register("minimumSellingPrice", moneyFieldOptions)}
          />
        </FormField>
        <FormField
          label={t("pricing.fields.target")}
          htmlFor="pricing-target"
          error={errorText(errors.targetSellingPrice?.message)}
        >
          <Input
            id="pricing-target"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            {...form.register("targetSellingPrice", moneyFieldOptions)}
          />
        </FormField>
        <FormField
          label={t("pricing.fields.maxDiscountAmount")}
          htmlFor="pricing-max-discount"
          error={errorText(errors.maximumDiscountAmount?.message)}
        >
          <Input
            id="pricing-max-discount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            {...form.register("maximumDiscountAmount", moneyFieldOptions)}
          />
        </FormField>
        <FormField
          label={t("pricing.fields.maxDiscountPercent")}
          htmlFor="pricing-max-discount-pct"
          hint={t("pricing.fields.maxDiscountPercentHint")}
        >
          {/* Calculated from the amount and the target selling price. */}
          <Input
            id="pricing-max-discount-pct"
            readOnly
            tabIndex={-1}
            className="bg-muted/50"
            value={discountPercent == null ? "" : `${discountPercent.toFixed(2)}%`}
            placeholder="—"
            aria-live="polite"
          />
        </FormField>
      </div>

      <div className="grid gap-2 rounded-lg border border-border/70 p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("pricing.summary.totalCost")}</span>
          <span className="font-medium">{money(totalCost)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("pricing.summary.expectedProfit")}</span>
          <span className="font-medium">{money(preview.expectedGrossProfit)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("pricing.summary.margin")}</span>
          <span className="font-medium">
            {preview.expectedMarginPercent == null
              ? "—"
              : `${preview.expectedMarginPercent.toFixed(2)}%`}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("pricing.summary.maxDiscount")}</span>
          <span className="font-medium">
            {money(parseMoneyInput(watchedDiscount))}
            {discountPercent != null ? ` (${discountPercent.toFixed(2)}%)` : null}
          </span>
        </div>
      </div>

      {preview.belowMinimum ? (
        <Alert variant="destructive">
          <AlertTitle>{t("pricing.warnings.belowMinimumTitle")}</AlertTitle>
          <AlertDescription>{t("pricing.warnings.belowMinimumBody")}</AlertDescription>
        </Alert>
      ) : null}

      {preview.isLoss ? (
        <Alert>
          <AlertTitle>{t("pricing.warnings.lossTitle")}</AlertTitle>
          <AlertDescription>{t("pricing.warnings.lossBody")}</AlertDescription>
        </Alert>
      ) : null}

      {preview.belowMinimum && canOverride ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={Boolean(watchedOverride)}
            onCheckedChange={(checked) => form.setValue("overrideMinimum", checked === true)}
          />
          <span>{t("pricing.fields.overrideMinimum")}</span>
        </label>
      ) : null}

      {watchedOverride ? (
        <FormField
          label={t("pricing.fields.overrideReason")}
          htmlFor="pricing-override-reason"
          error={errors.overrideReason?.message}
        >
          <Textarea id="pricing-override-reason" rows={2} {...form.register("overrideReason")} />
        </FormField>
      ) : null}

      <FormField
        label={t("pricing.fields.changeReason")}
        htmlFor="pricing-reason"
        error={errors.changeReason?.message}
      >
        <Controller
          control={form.control}
          name="changeReason"
          render={({ field }) => (
            <SearchableSelect
              id="pricing-reason"
              value={field.value}
              onValueChange={field.onChange}
              searchable={false}
              options={PRICING_CHANGE_REASONS.map((reason) => ({
                value: reason,
                label: t(`pricing.reasons.${reason}`),
              }))}
            />
          )}
        />
      </FormField>

      <FormField label={t("pricing.fields.notes")} htmlFor="pricing-notes">
        <Textarea id="pricing-notes" rows={2} {...form.register("pricingNotes")} />
      </FormField>

      <div className="flex flex-wrap gap-2">
        {onDone ? (
          <Button type="button" variant="outline" onClick={onDone}>
            {t("common.cancel")}
          </Button>
        ) : null}
        <LoadingButton type="submit" loading={upsert.isPending}>
          {t("pricing.actions.save")}
        </LoadingButton>
      </div>
    </form>
  );
}
