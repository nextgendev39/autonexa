"use client";

import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  ReplaceIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AcquisitionDocumentDialog,
  type AcquisitionDocumentDialogValues,
} from "@/components/acquisitions/acquisition-document-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentRowsSkeleton } from "@/components/feedback/skeletons";
import { usePermission } from "@/hooks/use-permission";
import {
  useAcquisitionDocumentMutations,
  useAcquisitionDocuments,
} from "@/hooks/use-acquisition-documents";
import {
  buildAcquisitionDocumentPath,
  uploadAcquisitionDocumentFile,
} from "@/lib/acquisitions/document-upload";
import { cn } from "@/lib/utils";
import { validateAcquisitionDocumentFile } from "@/lib/validation/acquisition-document";
import type {
  AcquisitionDocument,
  PendingAcquisitionDocument,
} from "@/types/acquisition-document";

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mime: string | null | undefined, fileName?: string) {
  const value = (mime || "").toLowerCase();
  if (value.startsWith("image/")) return "image" as const;
  if (value.includes("pdf") || (fileName || "").toLowerCase().endsWith(".pdf")) {
    return "pdf" as const;
  }
  return "other" as const;
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-1">
      {label ? <p className="text-muted-foreground text-xs">{label}</p> : null}
      <div
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function DocumentCardShell({
  title,
  subtitle,
  meta,
  kind,
  previewUrl,
  actions,
  progress,
  errorMessage,
  loading,
}: {
  title: string;
  subtitle: string;
  meta: string;
  kind: "image" | "pdf" | "other";
  previewUrl?: string | null;
  actions?: React.ReactNode;
  progress?: { value: number; label: string } | null;
  errorMessage?: string;
  loading?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative rounded-xl border border-border/70 bg-card p-4",
        loading && "border-primary/40",
      )}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <div className="bg-background/70 absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[1px]">
          <div className="bg-card flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-sm">
            <Loader2Icon className="text-primary size-4 animate-spin" aria-hidden />
            <span>{progress?.label || "…"}</span>
            {progress ? (
              <span className="text-muted-foreground tabular-nums">{progress.value}%</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        <div className="bg-muted/50 relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          {kind === "image" && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob/signed local preview
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : kind === "image" ? (
            <ImageIcon className="text-muted-foreground size-6" aria-hidden />
          ) : (
            <FileTextIcon className="text-muted-foreground size-6" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 grid gap-1">
          <p className="truncate font-medium">{title}</p>
          <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
          <p className="text-muted-foreground text-xs">{meta}</p>
          {progress ? <ProgressBar value={progress.value} label={progress.label} /> : null}
          {errorMessage ? (
            <p className="text-destructive text-xs wrap-break-word">{errorMessage}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}

type DraftProps = {
  mode: "draft";
  documents: PendingAcquisitionDocument[];
  onChange: (documents: PendingAcquisitionDocument[]) => void;
  disabled?: boolean;
};

type ManageProps = {
  mode: "manage";
  acquisitionId: string;
  vehicleId: string;
  readOnly?: boolean;
};

export type AcquisitionDocumentsManagerProps = DraftProps | ManageProps;

function DraftManager({
  documents,
  onChange,
  disabled,
}: {
  documents: PendingAcquisitionDocument[];
  onChange: (documents: PendingAcquisitionDocument[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  const canCreate = can("document.create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const isUploading = documents.some(
    (doc) => doc.status === "uploading" || doc.status === "saving" || doc.status === "waiting",
  );
  const activeUpload = documents.find(
    (doc) => doc.status === "uploading" || doc.status === "saving",
  );

  function addDocument(values: AcquisitionDocumentDialogValues) {
    const sameCategoryCount = documents.filter((doc) => doc.category === values.category).length;
    const defaultTitle = t(`acquisitions.documents.categories.${values.category}`);
    let title = values.title || defaultTitle;
    if (sameCategoryCount > 0 && title === defaultTitle) {
      title = `${defaultTitle} ${sameCategoryCount + 1}`;
    }

    // Always create a blob URL so PDFs/images can be opened from Review / View.
    const previewUrl = URL.createObjectURL(values.file);

    onChange([
      ...documents,
      {
        localId: crypto.randomUUID(),
        file: values.file,
        previewUrl,
        category: values.category,
        title,
        referenceNumber: values.referenceNumber,
        notes: values.notes,
        status: "ready",
        progress: 0,
      },
    ]);
  }

  function removeLocal(localId: string) {
    const target = documents.find((doc) => doc.localId === localId);
    if (target?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
    onChange(documents.filter((doc) => doc.localId !== localId));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="grid gap-1">
          <CardTitle>{t("acquisitions.documents.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("acquisitions.documents.description")}</p>
        </div>
        {canCreate ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 sm:h-9"
            disabled={disabled}
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon aria-hidden />
            {t("acquisitions.documents.addDocument")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {isUploading ? (
          <div
            className="bg-muted/40 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
            role="status"
            aria-live="polite"
          >
            <Loader2Icon className="text-primary size-5 shrink-0 animate-spin" aria-hidden />
            <div className="min-w-0 grid gap-0.5">
              <p className="font-medium">{t("acquisitions.documents.uploadingBatch")}</p>
              <p className="text-muted-foreground truncate text-xs">
                {activeUpload
                  ? `${activeUpload.title || activeUpload.file.name} · ${activeUpload.progress ?? 0}%`
                  : t("acquisitions.documents.waiting")}
              </p>
            </div>
          </div>
        ) : null}
        {documents.length === 0 ? (
          <EmptyState
            title={t("acquisitions.documents.emptyTitle")}
            description={t("acquisitions.documents.emptyHint")}
          />
        ) : (
          <ul className="grid gap-3">
            {documents.map((doc) => {
              const kind = fileKind(doc.file.type, doc.file.name);
              const size = formatBytes(doc.file.size);
              const status = doc.status ?? "ready";
              const loading = status === "uploading" || status === "saving";
              const progressLabel =
                status === "uploading"
                  ? t("acquisitions.documents.uploading")
                  : status === "saving"
                    ? t("acquisitions.documents.saving")
                    : status === "waiting"
                      ? t("acquisitions.documents.waiting")
                      : status === "error"
                        ? t("acquisitions.documents.failed")
                        : undefined;

              return (
                <DocumentCardShell
                  key={doc.localId}
                  title={doc.title || t(`acquisitions.documents.categories.${doc.category}`)}
                  subtitle={doc.file.name}
                  meta={[
                    kind === "pdf" ? "PDF" : kind === "image" ? t("acquisitions.documents.image") : null,
                    size,
                    t(`acquisitions.documents.categories.${doc.category}`),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  kind={kind}
                  previewUrl={doc.previewUrl || null}
                  loading={loading}
                  progress={
                    status === "uploading" || status === "saving"
                      ? {
                          value: doc.progress ?? 0,
                          label: progressLabel ?? "",
                        }
                      : status === "waiting"
                        ? { value: 0, label: progressLabel ?? "" }
                        : null
                  }
                  errorMessage={doc.errorMessage}
                  actions={
                    <>
                      {doc.previewUrl ? (
                        <a
                          href={doc.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLinkIcon className="size-4" aria-hidden />
                          {t("acquisitions.documents.view")}
                        </a>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disabled || loading || status === "waiting"}
                          onClick={() => {
                            const url = URL.createObjectURL(doc.file);
                            window.open(url, "_blank", "noopener,noreferrer");
                            // Revoke after the browser has a chance to load it.
                            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                          }}
                        >
                          <ExternalLinkIcon className="size-4" aria-hidden />
                          {t("acquisitions.documents.view")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled || loading || status === "waiting"}
                        onClick={() => removeLocal(doc.localId)}
                      >
                        <Trash2Icon className="size-4" aria-hidden />
                        {t("acquisitions.documents.remove")}
                      </Button>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </CardContent>
      <AcquisitionDocumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={addDocument}
      />
    </Card>
  );
}

function ManageManager({
  acquisitionId,
  vehicleId,
  readOnly,
}: {
  acquisitionId: string;
  vehicleId: string;
  readOnly?: boolean;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  const canCreate = can("document.create") && !readOnly;
  const canMutate =
    (can("document.edit") || can("document.create")) && !readOnly;
  const query = useAcquisitionDocuments(acquisitionId);
  const { add, replace, remove } = useAcquisitionDocumentMutations(acquisitionId, vehicleId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  async function uploadAndRegister(
    values: AcquisitionDocumentDialogValues,
    localKey: string,
  ) {
    const path = buildAcquisitionDocumentPath(
      vehicleId,
      acquisitionId,
      values.category,
      values.file.name,
    );
    setBusyId(localKey);
    setUploadProgress((prev) => ({ ...prev, [localKey]: 0 }));
    try {
      await uploadAcquisitionDocumentFile(values.file, path, (percent) => {
        setUploadProgress((prev) => ({ ...prev, [localKey]: percent }));
      });
      setUploadProgress((prev) => ({ ...prev, [localKey]: 95 }));
      await add.mutateAsync({
        storagePath: path,
        category: values.category,
        title: values.title,
        fileName: values.title || values.file.name,
        originalFileName: values.file.name,
        mimeType: values.file.type || null,
        fileSize: values.file.size,
        referenceNumber: values.referenceNumber || null,
        notes: values.notes || null,
      });
      toast.success(t("acquisitions.documents.toasts.uploaded"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("acquisitions.documents.toasts.uploadFailed"),
      );
    } finally {
      setBusyId(null);
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[localKey];
        return next;
      });
    }
  }

  async function onAdd(values: AcquisitionDocumentDialogValues) {
    await uploadAndRegister(values, `new-${crypto.randomUUID()}`);
  }

  async function onRemove(doc: AcquisitionDocument) {
    if (!canMutate) return;
    const confirmed = window.confirm(t("acquisitions.documents.confirmDelete"));
    if (!confirmed) return;
    setBusyId(doc.id);
    try {
      await remove.mutateAsync(doc.id);
      toast.success(t("acquisitions.documents.toasts.deleted"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("acquisitions.documents.toasts.deleteFailed"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onReplaceFile(doc: AcquisitionDocument, file: File) {
    const errorKey = validateAcquisitionDocumentFile(file);
    if (errorKey) {
      toast.error(t(errorKey));
      return;
    }
    const path = buildAcquisitionDocumentPath(
      vehicleId,
      acquisitionId,
      (doc.category as PendingAcquisitionDocument["category"]) || "other",
      file.name,
    );
    setBusyId(doc.id);
    setUploadProgress((prev) => ({ ...prev, [doc.id]: 0 }));
    try {
      await uploadAcquisitionDocumentFile(file, path, (percent) => {
        setUploadProgress((prev) => ({ ...prev, [doc.id]: percent }));
      });
      setUploadProgress((prev) => ({ ...prev, [doc.id]: 95 }));
      await replace.mutateAsync({
        documentId: doc.id,
        body: {
          storagePath: path,
          fileName: doc.title || file.name,
          originalFileName: file.name,
          mimeType: file.type || null,
          fileSize: file.size,
        },
      });
      toast.success(t("acquisitions.documents.toasts.replaced"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("acquisitions.documents.toasts.replaceFailed"),
      );
    } finally {
      setBusyId(null);
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
    }
  }

  if (query.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("acquisitions.documents.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3" aria-busy>
          <DocumentRowsSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("acquisitions.documents.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title={t("acquisitions.documents.loadFailed")}
            action={
              <Button variant="outline" onClick={() => void query.refetch()}>
                <RefreshCwIcon aria-hidden />
                {t("common.retry")}
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const docs = query.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="grid gap-1">
          <CardTitle>{t("acquisitions.documents.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("acquisitions.documents.description")}</p>
        </div>
        {canCreate ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 sm:h-9"
            disabled={Boolean(busyId)}
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon aria-hidden />
            {t("acquisitions.documents.addDocument")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {busyId ? (
          <div
            className="bg-muted/40 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
            role="status"
            aria-live="polite"
          >
            <Loader2Icon className="text-primary size-5 shrink-0 animate-spin" aria-hidden />
            <div className="min-w-0 grid gap-0.5">
              <p className="font-medium">{t("acquisitions.documents.uploadingBatch")}</p>
              <p className="text-muted-foreground text-xs">
                {uploadProgress[busyId] != null
                  ? `${uploadProgress[busyId]}%`
                  : t("acquisitions.documents.saving")}
              </p>
            </div>
          </div>
        ) : null}
        {docs.length === 0 ? (
          <EmptyState
            title={t("acquisitions.documents.emptyTitle")}
            description={t("acquisitions.documents.emptyHint")}
          />
        ) : (
          <ul className="grid gap-3">
            {docs.map((doc) => {
              const kind = fileKind(doc.mimeType, doc.fileName);
              const size = formatBytes(doc.fileSize);
              const categoryLabel = CATEGORY_SET.has(doc.category)
                ? t(`acquisitions.documents.categories.${doc.category}`)
                : doc.categoryLabel;
              const progress = uploadProgress[doc.id];
              const loading = busyId === doc.id;

              return (
                <DocumentCardShell
                  key={doc.id}
                  title={doc.title}
                  subtitle={doc.fileName}
                  meta={[
                    kind === "pdf" ? "PDF" : kind === "image" ? t("acquisitions.documents.image") : null,
                    size,
                    categoryLabel,
                    doc.referenceNumber,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  kind={kind}
                  previewUrl={kind === "image" ? doc.url : null}
                  loading={loading}
                  progress={
                    progress != null
                      ? {
                          value: progress,
                          label: t("acquisitions.documents.uploading"),
                        }
                      : null
                  }
                  actions={
                    <>
                      {doc.url ? (
                        <>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                          >
                            <ExternalLinkIcon className="size-4" aria-hidden />
                            {t("acquisitions.documents.view")}
                          </a>
                          <a
                            href={doc.url}
                            download={doc.fileName}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                          >
                            <DownloadIcon className="size-4" aria-hidden />
                            {t("acquisitions.documents.download")}
                          </a>
                        </>
                      ) : null}
                      {canMutate ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busyId)}
                            onClick={() => {
                              setReplaceTargetId(doc.id);
                              replaceInputRef.current?.click();
                            }}
                          >
                            {loading ? (
                              <Loader2Icon className="size-4 animate-spin" aria-hidden />
                            ) : (
                              <ReplaceIcon className="size-4" aria-hidden />
                            )}
                            {t("acquisitions.documents.replace")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busyId)}
                            onClick={() => void onRemove(doc)}
                          >
                            {loading && busyId === doc.id ? (
                              <Loader2Icon className="size-4 animate-spin" aria-hidden />
                            ) : (
                              <Trash2Icon className="size-4" aria-hidden />
                            )}
                            {t("acquisitions.documents.remove")}
                          </Button>
                        </>
                      ) : null}
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
        <input
          ref={replaceInputRef}
          type="file"
          className="sr-only"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const target = docs.find((doc) => doc.id === replaceTargetId);
            event.target.value = "";
            setReplaceTargetId(null);
            if (file && target) void onReplaceFile(target, file);
          }}
        />
      </CardContent>
      <AcquisitionDocumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={(values) => void onAdd(values)}
      />
    </Card>
  );
}

const CATEGORY_SET = new Set([
  "purchase_invoice",
  "auction_invoice",
  "seller_invoice",
  "purchase_agreement",
  "payment_receipt",
  "transport_document",
  "customs_document",
  "import_document",
  "registration_document",
  "inspection_document",
  "ownership_document",
  "other",
]);

/** Upload draft documents after acquisition creation. Returns failed pending items. */
export async function uploadPendingAcquisitionDocuments(
  acquisitionId: string,
  vehicleId: string,
  documents: PendingAcquisitionDocument[],
  addDocument: (body: {
    storagePath: string;
    category: PendingAcquisitionDocument["category"];
    title: string;
    fileName: string;
    originalFileName: string;
    mimeType: string | null;
    fileSize: number;
    referenceNumber: string | null;
    notes: string | null;
  }) => Promise<unknown>,
  onProgress?: (
    localId: string,
    progress: number,
    status: PendingAcquisitionDocument["status"],
    errorMessage?: string,
  ) => void,
): Promise<PendingAcquisitionDocument[]> {
  const failed: PendingAcquisitionDocument[] = [];

  for (const doc of documents) {
    onProgress?.(doc.localId, 0, "waiting");
  }

  for (const doc of documents) {
    const path = buildAcquisitionDocumentPath(
      vehicleId,
      acquisitionId,
      doc.category,
      doc.file.name,
    );
    try {
      onProgress?.(doc.localId, 0, "uploading");
      await uploadAcquisitionDocumentFile(doc.file, path, (percent) => {
        onProgress?.(doc.localId, percent, "uploading");
      });
      onProgress?.(doc.localId, 95, "saving");
      await addDocument({
        storagePath: path,
        category: doc.category,
        title: doc.title,
        fileName: doc.title || doc.file.name,
        originalFileName: doc.file.name,
        mimeType: doc.file.type || null,
        fileSize: doc.file.size,
        referenceNumber: doc.referenceNumber || null,
        notes: doc.notes || null,
      });
      onProgress?.(doc.localId, 100, "ready");
      if (doc.previewUrl.startsWith("blob:")) URL.revokeObjectURL(doc.previewUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      failed.push({
        ...doc,
        status: "error",
        errorMessage: message,
        progress: doc.progress ?? 0,
      });
      onProgress?.(doc.localId, doc.progress ?? 0, "error", message);
    }
  }
  return failed;
}

export function useRevokePendingDocuments(documents: PendingAcquisitionDocument[]) {
  useEffect(() => {
    return () => {
      for (const doc of documents) {
        if (doc.previewUrl.startsWith("blob:")) URL.revokeObjectURL(doc.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
  }, []);
}

export function AcquisitionDocumentsManager(props: AcquisitionDocumentsManagerProps) {
  if (props.mode === "draft") {
    return (
      <DraftManager
        documents={props.documents}
        onChange={props.onChange}
        disabled={props.disabled}
      />
    );
  }
  return (
    <ManageManager
      acquisitionId={props.acquisitionId}
      vehicleId={props.vehicleId}
      readOnly={props.readOnly}
    />
  );
}
