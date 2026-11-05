"use client";

import { FileIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

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
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { validateAcquisitionDocumentFile } from "@/lib/validation/acquisition-document";
import {
  ACQUISITION_DOCUMENT_CATEGORIES,
  type AcquisitionDocumentCategory,
} from "@/types/acquisition-document";

export type AcquisitionDocumentDialogValues = {
  category: AcquisitionDocumentCategory;
  file: File;
  title: string;
  referenceNumber: string;
  notes: string;
};

type FormValues = {
  category: AcquisitionDocumentCategory;
  title: string;
  referenceNumber: string;
  notes: string;
};

const FILE_ACCEPT = "application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/*";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AcquisitionDocumentDialogForm({
  defaultCategory,
  onAdd,
  onClose,
}: {
  defaultCategory: AcquisitionDocumentCategory;
  onAdd: (values: AcquisitionDocumentDialogValues) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      category: defaultCategory,
      title: t(`acquisitions.documents.categories.${defaultCategory}`),
      referenceNumber: "",
      notes: "",
    },
  });

  function applyFile(selected: File | null) {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const errorKey = validateAcquisitionDocumentFile(selected);
    if (errorKey) {
      setFile(null);
      setFileError(t(errorKey));
      return;
    }
    setFile(selected);
  }

  function onFileChange(next: FileList | null) {
    applyFile(next?.[0] ?? null);
  }

  function clearFile() {
    applyFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit(values: FormValues) {
    if (!file) {
      setFileError(t("acquisitions.documents.errors.fileRequired"));
      return;
    }
    onAdd({
      category: values.category,
      file,
      title: values.title.trim() || t(`acquisitions.documents.categories.${values.category}`),
      referenceNumber: values.referenceNumber.trim(),
      notes: values.notes.trim(),
    });
    onClose();
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
      <FormField label={t("acquisitions.documents.category")} htmlFor="acq-doc-category">
        <Controller
          control={form.control}
          name="category"
          render={({ field }) => (
            <SearchableSelect
              id="acq-doc-category"
              value={field.value}
              onValueChange={(value) => {
                const previousLabel = t(`acquisitions.documents.categories.${field.value}`);
                field.onChange(value);
                const currentTitle = form.getValues("title").trim();
                if (!currentTitle || currentTitle === previousLabel) {
                  form.setValue("title", t(`acquisitions.documents.categories.${value}`));
                }
              }}
              searchable
              options={ACQUISITION_DOCUMENT_CATEGORIES.map((key) => ({
                value: key,
                label: t(`acquisitions.documents.categories.${key}`),
              }))}
            />
          )}
        />
      </FormField>

      <FormField
        label={t("acquisitions.documents.file")}
        htmlFor="acq-doc-file"
        error={fileError ?? undefined}
        required
      >
        <input
          ref={inputRef}
          id="acq-doc-file"
          type="file"
          className="sr-only"
          accept={FILE_ACCEPT}
          onChange={(event) => {
            onFileChange(event.target.files);
            event.target.value = "";
          }}
        />

        {file ? (
          <div className="bg-muted/40 flex items-center gap-3 rounded-xl border px-3 py-3">
            <span className="bg-background flex size-10 shrink-0 items-center justify-center rounded-lg border">
              <FileIcon className="text-muted-foreground size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              {t("acquisitions.documents.changeFile")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("acquisitions.documents.removeFile")}
              onClick={clearFile}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFileChange(event.dataTransfer.files);
            }}
            className={cn(
              "hover:bg-muted/40 focus-visible:ring-ring flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2",
              dragging && "border-primary bg-primary/5",
              fileError && "border-destructive",
            )}
          >
            <span className="bg-muted flex size-11 items-center justify-center rounded-full">
              <UploadCloudIcon className="text-muted-foreground size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{t("acquisitions.documents.chooseFile")}</span>
            <span className="text-muted-foreground text-xs">
              {t("acquisitions.documents.dropHint")}
            </span>
          </button>
        )}
        <p className="text-muted-foreground mt-1 text-xs">{t("acquisitions.documents.fileHint")}</p>
      </FormField>

      <FormField label={t("acquisitions.documents.documentName")} htmlFor="acq-doc-title">
        <Input
          id="acq-doc-title"
          className="h-11 md:h-10"
          autoComplete="off"
          {...form.register("title")}
        />
      </FormField>

      <FormField label={t("acquisitions.documents.referenceNumber")} htmlFor="acq-doc-ref">
        <Input
          id="acq-doc-ref"
          className="h-11 md:h-10"
          autoComplete="off"
          placeholder={t("acquisitions.documents.referencePlaceholder")}
          {...form.register("referenceNumber")}
        />
      </FormField>

      <FormField label={t("acquisitions.documents.notes")} htmlFor="acq-doc-notes">
        <Textarea id="acq-doc-notes" rows={3} className="min-h-20" {...form.register("notes")} />
      </FormField>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("acquisitions.actions.cancel")}
        </Button>
        <LoadingButton type="submit">{t("acquisitions.documents.addDocument")}</LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function AcquisitionDocumentDialog({
  open,
  onOpenChange,
  onAdd,
  defaultCategory = "purchase_invoice",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (values: AcquisitionDocumentDialogValues) => void;
  defaultCategory?: AcquisitionDocumentCategory;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("acquisitions.documents.addTitle")}</DialogTitle>
          <DialogDescription>{t("acquisitions.documents.addDescription")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <AcquisitionDocumentDialogForm
            key={`${defaultCategory}-${String(open)}`}
            defaultCategory={defaultCategory}
            onAdd={onAdd}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
