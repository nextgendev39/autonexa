"use client";

import { useRef, useState } from "react";
import { FileUpIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DateField } from "@/components/forms/date-field";
import { NativeSelect } from "@/components/inventory/native-select";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  STAFF_DOCUMENT_ACCEPT,
  STAFF_DOCUMENT_CATEGORIES,
  validateStaffDocumentFile,
  type StaffDocumentCategory,
} from "@/lib/validation/staff-document";
import { formatFileSize } from "@/components/documents/document-utils";

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const titleFromFileName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

function UploadForm({ onDone, onUploaded }: { onDone: () => void; onUploaded: () => void }) {
  const t = useTranslations("documents");
  const tRoot = useTranslations();
  const msg = (key: string) => tRoot(key as Parameters<typeof tRoot>[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState<StaffDocumentCategory>("other");
  const [title, setTitle] = useState("");
  const [expiresOn, setExpiresOn] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function pick(next: File | undefined) {
    if (!next) return;
    const invalid = validateStaffDocumentFile(next);
    setErrors((prev) => {
      const rest = { ...prev };
      delete rest.file;
      return invalid ? { ...rest, file: invalid } : rest;
    });
    if (invalid) return;
    setFile(next);
    if (!title.trim()) setTitle(titleFromFileName(next.name));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!file) nextErrors.file = "documents.errors.fileRequired";
    if (!title.trim()) nextErrors.title = "validation.required";
    setErrors(nextErrors);
    if (!file || Object.keys(nextErrors).length > 0) return;

    const body = new FormData();
    body.set("file", file);
    body.set("category", category);
    body.set("title", title.trim());
    if (expiresOn) body.set("expiresOn", toIsoDate(expiresOn));
    if (notes.trim()) body.set("notes", notes.trim());

    setSaving(true);
    try {
      const res = await fetch("/api/documents", { method: "POST", credentials: "same-origin", body });
      const json = await res.json().catch(() => null);
      if (json?.status !== "success") {
        if (json?.fieldErrors) setErrors(json.fieldErrors);
        toast.error(t("errors.uploadFailed"));
        return;
      }
      toast.success(t("uploaded"));
      onUploaded();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept={STAFF_DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file ? (
          <div className="bg-muted/50 flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <FileUpIcon className="text-brand size-5 shrink-0" />
            <div className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{file.name}</span>
              <span className="text-muted-foreground text-xs">{formatFileSize(file.size)}</span>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeFile")} onClick={() => setFile(null)}>
              <XIcon />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            aria-describedby={errors.file ? "document-file-error" : undefined}
            className={cn(
              "hover:border-brand/50 hover:bg-brand-soft/40 focus-visible:ring-ring/50 grid place-items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-3",
              dragging && "border-brand bg-brand-soft/50",
              errors.file && "border-destructive/60",
            )}
          >
            <span className="bg-brand-soft text-brand flex size-11 items-center justify-center rounded-full">
              <FileUpIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">{t("dropzone")}</span>
            <span className="text-muted-foreground text-xs">{t("fileTypes")}</span>
          </button>
        )}
        {errors.file ? (
          <p id="document-file-error" className="text-destructive text-xs">
            {msg(errors.file)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="document-category">{t("category")}</Label>
          <NativeSelect
            id="document-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as StaffDocumentCategory)}
          >
            {STAFF_DOCUMENT_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {t(`categories.${key}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="document-expires">
            {t("expiresOn")}
            <span className="text-muted-foreground font-normal">({tRoot("common.optional")})</span>
          </Label>
          <DateField id="document-expires" value={expiresOn} onChange={setExpiresOn} placeholder={t("noExpiry")} />
        </div>
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor="document-title">{t("titleLabel")}</Label>
        <Input
          id="document-title"
          value={title}
          maxLength={150}
          placeholder={t("titlePlaceholder")}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!errors.title || undefined}
        />
        {errors.title ? <p className="text-destructive text-xs">{msg(errors.title)}</p> : null}
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor="document-notes">
          {t("notes")}
          <span className="text-muted-foreground font-normal">({tRoot("common.optional")})</span>
        </Label>
        <Textarea id="document-notes" value={notes} maxLength={1000} rows={2} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <LoadingButton type="submit" variant="brand" loading={saving}>
          {t("upload")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const t = useTranslations("documents");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("uploadTitle")}</DialogTitle>
          <DialogDescription>{t("uploadDescription")}</DialogDescription>
        </DialogHeader>
        {/* Remounted per open so each upload starts empty. */}
        {open ? <UploadForm onDone={() => onOpenChange(false)} onUploaded={onUploaded} /> : null}
      </DialogContent>
    </Dialog>
  );
}
