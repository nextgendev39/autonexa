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
import { useAcquisitionMutations } from "@/hooks/use-acquisitions";
import {
  approveAcquisitionSchema,
  rejectAcquisitionSchema,
  type RejectAcquisitionValues,
} from "@/lib/validation/acquisition";

type Mode = "approve" | "reject";

function ApprovalForm({
  acquisitionId,
  mode,
  onDone,
}: {
  acquisitionId: string;
  mode: Mode;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { approve, reject } = useAcquisitionMutations(acquisitionId);

  const approveForm = useForm({
    resolver: zodResolver(approveAcquisitionSchema) as never,
    defaultValues: { note: "" as string | null },
  });
  const rejectForm = useForm<RejectAcquisitionValues>({
    resolver: zodResolver(rejectAcquisitionSchema),
    defaultValues: { reason: "" },
  });

  async function submitApprove(values: { note?: string | null }) {
    try {
      await approve.mutateAsync({ note: values.note ?? null });
      toast.success(t("acquisitions.toasts.approved"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("acquisitions.toasts.error"));
    }
  }

  async function submitReject(values: RejectAcquisitionValues) {
    try {
      await reject.mutateAsync(values);
      toast.success(t("acquisitions.toasts.rejected"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("acquisitions.toasts.error"));
    }
  }

  if (mode === "approve") {
    return (
      <form className="grid gap-4" noValidate onSubmit={approveForm.handleSubmit(submitApprove)}>
        <FormField
          label={t("acquisitions.dialogs.approval.note")}
          htmlFor="approval-note"
          error={approveForm.formState.errors.note?.message}
        >
          <Textarea
            id="approval-note"
            rows={3}
            maxLength={500}
            placeholder={t("acquisitions.dialogs.approval.notePlaceholder")}
            {...approveForm.register("note")}
          />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t("acquisitions.actions.cancel")}
          </Button>
          <LoadingButton type="submit" loading={approve.isPending}>
            {t("acquisitions.dialogs.approval.approveSubmit")}
          </LoadingButton>
        </DialogFooter>
      </form>
    );
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={rejectForm.handleSubmit(submitReject)}>
      <FormField
        label={t("acquisitions.dialogs.approval.reason")}
        htmlFor="reject-reason"
        error={rejectForm.formState.errors.reason?.message}
      >
        <Textarea
          id="reject-reason"
          rows={3}
          maxLength={500}
          placeholder={t("acquisitions.dialogs.approval.reasonPlaceholder")}
          aria-invalid={rejectForm.formState.errors.reason ? true : undefined}
          {...rejectForm.register("reason")}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("acquisitions.actions.cancel")}
        </Button>
        <LoadingButton type="submit" variant="destructive" loading={reject.isPending}>
          {t("acquisitions.dialogs.approval.rejectSubmit")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function AcquisitionApprovalDialog({
  acquisitionId,
  mode,
  open,
  onOpenChange,
}: {
  acquisitionId: string;
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "approve"
              ? t("acquisitions.dialogs.approval.approveTitle")
              : t("acquisitions.dialogs.approval.rejectTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? t("acquisitions.dialogs.approval.approveDescription")
              : t("acquisitions.dialogs.approval.rejectDescription")}
          </DialogDescription>
        </DialogHeader>
        <ApprovalForm
          acquisitionId={acquisitionId}
          mode={mode}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
