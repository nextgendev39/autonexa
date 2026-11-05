"use client";

import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AcquisitionForm } from "@/components/acquisitions/acquisition-form";
import {
  AcquisitionDocumentsManager,
  uploadPendingAcquisitionDocuments,
  useRevokePendingDocuments,
} from "@/components/acquisitions/acquisition-documents-manager";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcquisition, useAcquisitionMutations } from "@/hooks/use-acquisitions";
import { addAcquisitionDocumentRequest } from "@/lib/acquisitions/document-api-client";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { AcquisitionFormValues } from "@/lib/validation/acquisition";
import type { PendingAcquisitionDocument } from "@/types/acquisition-document";

type MutationError = Error & {
  fieldErrors?: Record<string, string>;
  code?: string;
  existingVehicleId?: string;
  existingAcquisitionId?: string;
};

function useSubmitErrors() {
  const t = useTranslations();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [formError, setFormError] = useState<ReactNode>(null);

  function reset() {
    setFieldErrors(undefined);
    setFormError(null);
  }

  function handle(error: unknown) {
    const err = error as MutationError;
    const message = err.message || t("acquisitions.toasts.error");

    setFieldErrors(err.fieldErrors ? { ...err.fieldErrors } : undefined);
    setFormError(
      <span className="flex flex-col gap-2">
        <span>
          {err.code === "duplicate_acquisition"
            ? t("acquisitions.errors.duplicateActive")
            : message}
        </span>
        {err.existingAcquisitionId ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm">
              {t("acquisitions.errors.duplicateActiveHint")}
            </span>
            <Link
              href={`/acquisitions/${err.existingAcquisitionId}`}
              className="font-medium underline underline-offset-4"
            >
              {t("acquisitions.actions.viewExisting")}
            </Link>
          </span>
        ) : err.existingVehicleId ? (
          <Link
            href={`/inventory/${err.existingVehicleId}`}
            className="font-medium underline underline-offset-4"
          >
            {t("acquisitions.actions.viewExistingVehicle")}
          </Link>
        ) : null}
      </span>,
    );
    toast.error(message);
  }

  return { fieldErrors, formError, reset, handle };
}

function CreateAcquisition({ initialVehicleId }: { initialVehicleId?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { create } = useAcquisitionMutations();
  const errors = useSubmitErrors();
  const [pendingDocuments, setPendingDocuments] = useState<PendingAcquisitionDocument[]>([]);
  const [createdAcquisitionId, setCreatedAcquisitionId] = useState<string | null>(null);
  const [createdVehicleId, setCreatedVehicleId] = useState<string | null>(null);
  const [failedDocuments, setFailedDocuments] = useState<PendingAcquisitionDocument[]>([]);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const submitLock = useRef(false);
  useRevokePendingDocuments(pendingDocuments);

  async function uploadForAcquisition(
    acquisitionId: string,
    vehicleId: string,
    documents: PendingAcquisitionDocument[],
  ) {
    setUploadingDocuments(true);
    try {
      const failed = await uploadPendingAcquisitionDocuments(
        acquisitionId,
        vehicleId,
        documents,
        async (body) => {
          const result = await addAcquisitionDocumentRequest(acquisitionId, body);
          if (result.status === "error") throw new Error(result.message);
          return result.data;
        },
        (localId, progress, status, errorMessage) => {
          setPendingDocuments((current) =>
            current.map((doc) =>
              doc.localId === localId
                ? {
                    ...doc,
                    progress,
                    status,
                    errorMessage: status === "error" ? errorMessage : undefined,
                  }
                : doc,
            ),
          );
        },
      );
      setFailedDocuments(failed);
      return failed;
    } finally {
      setUploadingDocuments(false);
    }
  }

  async function onSubmit(values: AcquisitionFormValues) {
    if (create.isPending || uploadingDocuments || submitLock.current) return;
    submitLock.current = true;
    errors.reset();
    try {
      let acquisitionId = createdAcquisitionId;
      let vehicleId = createdVehicleId;

      if (!acquisitionId || !vehicleId) {
        const acquisition = await create.mutateAsync(values);
        acquisitionId = acquisition.id;
        vehicleId = acquisition.vehicleId;
        setCreatedAcquisitionId(acquisitionId);
        setCreatedVehicleId(vehicleId);
        toast.success(
          t("acquisitions.toasts.created", { number: acquisition.acquisitionNumber }),
        );
      }

      if (pendingDocuments.length > 0) {
        const failed = await uploadForAcquisition(acquisitionId, vehicleId, pendingDocuments);
        if (failed.length > 0) {
          setPendingDocuments(failed);
          toast.error(t("acquisitions.documents.toasts.partialUpload"));
          return;
        }
        setPendingDocuments([]);
      }

      router.push(`/acquisitions/${acquisitionId}`);
    } catch (error) {
      errors.handle(error);
    } finally {
      submitLock.current = false;
    }
  }

  async function retryFailedUploads() {
    if (!createdAcquisitionId || !createdVehicleId || failedDocuments.length === 0) return;
    const failed = await uploadForAcquisition(
      createdAcquisitionId,
      createdVehicleId,
      failedDocuments,
    );
    if (failed.length === 0) {
      setFailedDocuments([]);
      setPendingDocuments([]);
      toast.success(t("acquisitions.documents.toasts.retrySuccess"));
      router.push(`/acquisitions/${createdAcquisitionId}`);
      return;
    }
    setFailedDocuments(failed);
    setPendingDocuments(failed);
    toast.error(t("acquisitions.documents.toasts.partialUpload"));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("modules.acquisitionsNew.title")}
        description={t("modules.acquisitionsNew.description")}
      />
      {uploadingDocuments ? (
        <div
          className="bg-muted/40 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <Loader2Icon className="text-primary size-5 shrink-0 animate-spin" aria-hidden />
          <div className="min-w-0 grid gap-0.5">
            <p className="font-medium">{t("acquisitions.documents.uploadingBatch")}</p>
            <p className="text-muted-foreground text-xs">
              {t("acquisitions.documents.uploadingBatchHint")}
            </p>
          </div>
        </div>
      ) : null}
      {createdAcquisitionId && failedDocuments.length > 0 && !uploadingDocuments ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
          <div className="grid gap-1">
            <p>{t("acquisitions.documents.toasts.partialUpload")}</p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              {failedDocuments.map((doc) => (
                <li key={doc.localId}>{doc.title || doc.file.name}</li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            onClick={() => void retryFailedUploads()}
            disabled={uploadingDocuments}
          >
            {uploadingDocuments ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("acquisitions.documents.retryUpload")}
          </Button>
        </div>
      ) : null}
      <AcquisitionForm
        mode="create"
        initialVehicleId={initialVehicleId}
        submitting={create.isPending || uploadingDocuments}
        submittingLabel={
          uploadingDocuments
            ? t("acquisitions.documents.uploadingBatch")
            : create.isPending
              ? t("acquisitions.actions.updating")
              : undefined
        }
        fieldErrors={errors.fieldErrors}
        formError={errors.formError}
        cancelHref="/acquisitions"
        onSubmit={onSubmit}
        extraSections={
          <AcquisitionDocumentsManager
            mode="draft"
            documents={pendingDocuments}
            onChange={setPendingDocuments}
            disabled={create.isPending || uploadingDocuments}
          />
        }
      />
    </div>
  );
}

function EditAcquisition({ acquisitionId }: { acquisitionId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const query = useAcquisition(acquisitionId);
  const { update } = useAcquisitionMutations(acquisitionId);
  const errors = useSubmitErrors();

  async function onSubmit(values: AcquisitionFormValues) {
    errors.reset();
    try {
      await update.mutateAsync(values);
      toast.success(t("acquisitions.toasts.updated"));
      router.push(`/acquisitions/${acquisitionId}`);
    } catch (error) {
      errors.handle(error);
    }
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        title={t("acquisitions.empty.notFound")}
        description={t("acquisitions.empty.notFoundHint")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
            <Link href="/acquisitions" className={cn(buttonVariants())}>
              {t("acquisitions.actions.back")}
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("acquisitions.form.editTitle")}
        description={t("acquisitions.form.editDescription")}
      />
      <AcquisitionForm
        mode="edit"
        acquisition={query.data}
        submitting={update.isPending}
        fieldErrors={errors.fieldErrors}
        formError={errors.formError}
        cancelHref={`/acquisitions/${acquisitionId}`}
        onSubmit={onSubmit}
        extraSections={
          <AcquisitionDocumentsManager
            mode="manage"
            acquisitionId={acquisitionId}
            vehicleId={query.data.vehicleId}
          />
        }
      />
    </div>
  );
}

export function AcquisitionFormPage(
  props: { mode: "create"; initialVehicleId?: string } | { mode: "edit"; acquisitionId: string },
) {
  return props.mode === "create" ? (
    <CreateAcquisition initialVehicleId={props.initialVehicleId} />
  ) : (
    <EditAcquisition acquisitionId={props.acquisitionId} />
  );
}
