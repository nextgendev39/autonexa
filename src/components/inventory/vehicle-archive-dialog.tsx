"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
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
import { Textarea } from "@/components/ui/textarea";
import { useVehicleMutations } from "@/hooks/use-vehicles";
import { archiveVehicleSchema, type ArchiveVehicleValues } from "@/lib/validation/vehicle";

function ArchiveForm({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const t = useTranslations();
  const { archive } = useVehicleMutations(vehicleId);
  const form = useForm<ArchiveVehicleValues>({
    resolver: zodResolver(archiveVehicleSchema),
    defaultValues: { reason: "" },
  });
  const { errors } = form.formState;

  async function submit(values: ArchiveVehicleValues) {
    try {
      await archive.mutateAsync(values);
      toast.success(t("inventory.toasts.archived"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.toasts.error"));
    }
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
      <FormField
        label={t("inventory.dialogs.archive.reason")}
        htmlFor="archive-reason"
        error={errors.reason?.message}
      >
        <Textarea
          id="archive-reason"
          rows={3}
          maxLength={500}
          placeholder={t("inventory.dialogs.archive.reasonPlaceholder")}
          aria-invalid={errors.reason ? true : undefined}
          {...form.register("reason")}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("inventory.actions.cancel")}
        </Button>
        <LoadingButton type="submit" variant="destructive" loading={archive.isPending}>
          {t("inventory.dialogs.archive.submit")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function VehicleArchiveDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: { id: string; stockNumber: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.dialogs.archive.title")}</DialogTitle>
          <DialogDescription>
            {t("inventory.dialogs.archive.description", { stock: vehicle.stockNumber })}
          </DialogDescription>
        </DialogHeader>
        <ArchiveForm vehicleId={vehicle.id} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
