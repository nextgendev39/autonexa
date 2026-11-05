"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { toDateInputValue } from "@/components/inventory/inventory-utils";
import {
  ACQUISITION_EXPENSE_ICONS,
  acquisitionCurrencyOptions,
} from "@/components/acquisitions/acquisition-select-icons";
import { LoadingButton } from "@/components/shared/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useAcquisitionMutations } from "@/hooks/use-acquisitions";
import {
  acquisitionExpenseSchema,
  type AcquisitionExpenseValues,
} from "@/lib/validation/acquisition";
import {
  ACQUISITION_EXPENSE_TYPES,
  type AcquisitionExpense,
} from "@/types/acquisition";

export function AcquisitionExpenseDialog({
  acquisitionId,
  expense,
  open,
  onOpenChange,
}: {
  acquisitionId: string;
  expense?: AcquisitionExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const { addExpense, updateExpense } = useAcquisitionMutations(acquisitionId);
  const isEdit = Boolean(expense);

  const form = useForm({
    resolver: zodResolver(acquisitionExpenseSchema),
    defaultValues: {
      expenseType: expense?.expenseType ?? "other",
      description: expense?.description ?? "",
      amount: expense?.amount ?? (undefined as unknown as number),
      currency: expense?.currency ?? "AED",
      expenseDate: toDateInputValue(expense?.expenseDate) || toDateInputValue(new Date().toISOString()),
      vendor: expense?.vendor ?? "",
      reference: expense?.reference ?? "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      expenseType: expense?.expenseType ?? "other",
      description: expense?.description ?? "",
      amount: expense?.amount ?? (undefined as unknown as number),
      currency: expense?.currency ?? "AED",
      expenseDate:
        toDateInputValue(expense?.expenseDate) || toDateInputValue(new Date().toISOString()),
      vendor: expense?.vendor ?? "",
      reference: expense?.reference ?? "",
    });
  }, [open, expense, form]);

  const { errors } = form.formState;

  async function submit(values: AcquisitionExpenseValues) {
    try {
      if (isEdit && expense) {
        await updateExpense.mutateAsync({ expenseId: expense.id, body: values });
        toast.success(t("acquisitions.toasts.expenseUpdated"));
      } else {
        await addExpense.mutateAsync(values);
        toast.success(t("acquisitions.toasts.expenseAdded"));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("acquisitions.toasts.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("acquisitions.dialogs.expense.editTitle")
              : t("acquisitions.dialogs.expense.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("acquisitions.dialogs.expense.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
          <FormField
            label={t("acquisitions.fields.expenseType")}
            htmlFor="expense-type"
            error={errors.expenseType?.message}
          >
            <Controller
              control={form.control}
              name="expenseType"
              render={({ field }) => (
                <SearchableSelect
                  id="expense-type"
                  value={field.value}
                  onValueChange={field.onChange}
                  searchable={false}
                  options={ACQUISITION_EXPENSE_TYPES.filter((type) => type !== "purchase").map(
                    (type) => ({
                      value: type,
                      label: t(`acquisitions.expenseTypes.${type}`),
                      icon: ACQUISITION_EXPENSE_ICONS[type],
                    }),
                  )}
                />
              )}
            />
          </FormField>
          <FormField
            label={t("acquisitions.fields.amount")}
            htmlFor="expense-amount"
            error={errors.amount?.message}
          >
            <Input
              id="expense-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="h-11 md:h-10"
              aria-invalid={errors.amount ? true : undefined}
              {...form.register("amount")}
            />
          </FormField>
          <FormField
            label={t("acquisitions.fields.currency")}
            htmlFor="expense-currency"
            error={errors.currency?.message}
          >
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <SearchableSelect
                  id="expense-currency"
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
            label={t("acquisitions.fields.expenseDate")}
            htmlFor="expense-date"
            error={errors.expenseDate?.message}
          >
            <Input
              id="expense-date"
              type="date"
              className="h-11 md:h-10"
              aria-invalid={errors.expenseDate ? true : undefined}
              {...form.register("expenseDate")}
            />
          </FormField>
          <FormField
            label={t("acquisitions.fields.vendor")}
            htmlFor="expense-vendor"
            error={errors.vendor?.message}
          >
            <Input id="expense-vendor" className="h-11 md:h-10" {...form.register("vendor")} />
          </FormField>
          <FormField
            label={t("acquisitions.fields.reference")}
            htmlFor="expense-reference"
            error={errors.reference?.message}
          >
            <Input
              id="expense-reference"
              className="h-11 md:h-10"
              {...form.register("reference")}
            />
          </FormField>
          <FormField
            label={t("acquisitions.fields.description")}
            htmlFor="expense-description"
            error={errors.description?.message}
          >
            <Textarea id="expense-description" rows={3} {...form.register("description")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("acquisitions.actions.cancel")}
            </Button>
            <LoadingButton
              type="submit"
              loading={addExpense.isPending || updateExpense.isPending}
            >
              {isEdit
                ? t("acquisitions.dialogs.expense.updateSubmit")
                : t("acquisitions.dialogs.expense.addSubmit")}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
