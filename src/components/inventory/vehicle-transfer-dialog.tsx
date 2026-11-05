"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { BRANCH_ICON, LOCATION_ICON } from "@/components/inventory/vehicle-select-icons";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormFieldsSkeleton } from "@/components/feedback/skeletons";
import { Textarea } from "@/components/ui/textarea";
import { useInventoryMeta, useVehicleMutations } from "@/hooks/use-vehicles";
import { transferVehicleSchema, type TransferVehicleValues } from "@/lib/validation/vehicle";

type TransferInput = z.input<typeof transferVehicleSchema>;
type DialogVehicle = {
  id: string;
  stockNumber: string;
  branchId: string;
  locationId: string | null;
};

function TransferForm({ vehicle, onDone }: { vehicle: DialogVehicle; onDone: () => void }) {
  const t = useTranslations();
  const meta = useInventoryMeta();
  const { transfer } = useVehicleMutations(vehicle.id);

  const form = useForm<TransferInput, unknown, TransferVehicleValues>({
    resolver: zodResolver(transferVehicleSchema),
    defaultValues: {
      branchId: vehicle.branchId,
      locationId: vehicle.locationId ?? "",
      reason: "",
    },
  });
  const { errors } = form.formState;
  const branchId = useWatch({ control: form.control, name: "branchId" });
  const locations = (meta.data?.locations ?? []).filter((item) => item.branchId === branchId);

  async function submit(values: TransferVehicleValues) {
    if (values.branchId === vehicle.branchId && values.locationId === vehicle.locationId) {
      form.setError("branchId", { type: "validate", message: t("inventory.dialogs.transfer.sameBranch") });
      return;
    }
    try {
      await transfer.mutateAsync(values);
      toast.success(t("inventory.toasts.transferred"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.toasts.error"));
    }
  }

  if (meta.isPending) return <FormFieldsSkeleton fields={2} />;

  if (meta.isError) {
    return (
      <div className="grid gap-3">
        <p className="text-destructive text-sm">{t("inventory.form.metaFailed")}</p>
        <Button variant="outline" onClick={() => void meta.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
      <FormField
        label={t("inventory.dialogs.transfer.branch")}
        htmlFor="transfer-branch"
        error={errors.branchId?.message}
      >
        <Controller
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <SearchableSelect
              id="transfer-branch"
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                form.setValue("locationId", "");
              }}
              options={meta.data.branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
                icon: BRANCH_ICON,
              }))}
              placeholder={t("inventory.form.selectBranch")}
              aria-invalid={errors.branchId ? true : undefined}
            />
          )}
        />
      </FormField>
      <FormField
        label={t("inventory.dialogs.transfer.location")}
        htmlFor="transfer-location"
        error={errors.locationId?.message}
      >
        <Controller
          control={form.control}
          name="locationId"
          render={({ field }) => (
            <SearchableSelect
              id="transfer-location"
              value={field.value ?? ""}
              onValueChange={field.onChange}
              optional
              placeholder={t("inventory.form.noLocation")}
              options={locations.map((location) => ({
                value: location.id,
                label: location.name,
                icon: LOCATION_ICON,
              }))}
            />
          )}
        />
      </FormField>
      <FormField
        label={t("inventory.dialogs.transfer.reason")}
        htmlFor="transfer-reason"
        error={errors.reason?.message}
      >
        <Textarea
          id="transfer-reason"
          rows={3}
          maxLength={500}
          placeholder={t("inventory.dialogs.transfer.reasonPlaceholder")}
          aria-invalid={errors.reason ? true : undefined}
          {...form.register("reason")}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("inventory.actions.cancel")}
        </Button>
        <LoadingButton type="submit" loading={transfer.isPending}>
          {t("inventory.dialogs.transfer.submit")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function VehicleTransferDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: DialogVehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.dialogs.transfer.title")}</DialogTitle>
          <DialogDescription>
            {t("inventory.dialogs.transfer.description", { stock: vehicle.stockNumber })}
          </DialogDescription>
        </DialogHeader>
        <TransferForm vehicle={vehicle} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
