"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { ACQUISITION_STATUS_ICONS } from "@/components/acquisitions/acquisition-select-icons";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { useAcquisitionMutations } from "@/hooks/use-acquisitions";
import { getAllowedNextStatuses } from "@/lib/acquisitions/status-transitions";
import {
  changeAcquisitionStatusSchema,
  type ChangeAcquisitionStatusValues,
} from "@/lib/validation/acquisition";
import type { AcquisitionStatus } from "@/types/acquisition";

type DialogAcquisition = { id: string; status: AcquisitionStatus };

function StatusForm({
  acquisition,
  onDone,
}: {
  acquisition: DialogAcquisition;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { changeStatus } = useAcquisitionMutations(acquisition.id);
  const options = getAllowedNextStatuses(acquisition.status).filter(
    (status) => status !== "approved" && status !== "rejected",
  );

  const form = useForm<ChangeAcquisitionStatusValues>({
    resolver: zodResolver(changeAcquisitionStatusSchema),
    defaultValues: { status: options[0], reason: "" },
  });
  const { errors } = form.formState;

  async function submit(values: ChangeAcquisitionStatusValues) {
    try {
      await changeStatus.mutateAsync(values);
      toast.success(t("acquisitions.toasts.statusChanged"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("acquisitions.toasts.error"));
    }
  }

  if (options.length === 0) {
    return (
      <>
        <Alert>
          <AlertDescription>{t("acquisitions.dialogs.status.noTransitions")}</AlertDescription>
        </Alert>
        <DialogFooter showCloseButton />
      </>
    );
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
      <FormField
        label={t("acquisitions.dialogs.status.newStatus")}
        htmlFor="status-next"
        error={errors.status?.message}
      >
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <SearchableSelect
              id="status-next"
              value={field.value}
              onValueChange={field.onChange}
              searchable={false}
              options={options.map((status) => ({
                value: status,
                label: t(`acquisitions.status.${status}`),
                icon: ACQUISITION_STATUS_ICONS[status],
              }))}
              aria-invalid={errors.status ? true : undefined}
            />
          )}
        />
      </FormField>
      <FormField
        label={t("acquisitions.dialogs.status.reason")}
        htmlFor="status-reason"
        error={errors.reason?.message}
      >
        <Textarea
          id="status-reason"
          rows={3}
          maxLength={500}
          placeholder={t("acquisitions.dialogs.status.reasonPlaceholder")}
          aria-invalid={errors.reason ? true : undefined}
          {...form.register("reason")}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("acquisitions.actions.cancel")}
        </Button>
        <LoadingButton type="submit" loading={changeStatus.isPending}>
          {t("acquisitions.dialogs.status.submit")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function AcquisitionStatusDialog({
  acquisition,
  open,
  onOpenChange,
}: {
  acquisition: DialogAcquisition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("acquisitions.dialogs.status.title")}</DialogTitle>
          <DialogDescription>
            {t("acquisitions.dialogs.status.description", {
              status: t(`acquisitions.status.${acquisition.status}`),
            })}
          </DialogDescription>
        </DialogHeader>
        <StatusForm acquisition={acquisition} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
