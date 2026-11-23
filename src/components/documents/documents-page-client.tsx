"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DownloadIcon,
  EyeIcon,
  FolderLockIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FileKindIcon, formatFileSize } from "@/components/documents/document-utils";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { DataPanel } from "@/components/layout/data-panel";
import { chipClass } from "@/components/ui/chip";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { AppLocale } from "@/config/app";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import {
  STAFF_DOCUMENT_CATEGORIES,
  type StaffDocument,
  type StaffDocumentCategory,
} from "@/lib/validation/staff-document";

type Scope = "mine" | "all";

export function DocumentsPageClient({
  initialDocuments,
  canViewAll,
}: {
  initialDocuments: StaffDocument[];
  /** Super Admins can switch to everyone's documents. */
  canViewAll: boolean;
}) {
  const t = useTranslations("documents");
  const [documents, setDocuments] = useState(initialDocuments);
  const [scope, setScope] = useState<Scope>("mine");
  const [category, setCategory] = useState<StaffDocumentCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<StaffDocument | null>(null);

  const load = useCallback(
    async (next: Scope) => {
      const res = await fetch(`/api/documents?scope=${next}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (json?.status === "success") setDocuments(json.data);
      else toast.error(t("errors.loadFailed"));
    },
    [t],
  );

  const switchScope = (next: Scope) => {
    setScope(next);
    void load(next);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter(
      (d) =>
        (category === "all" || d.category === category) &&
        (!q ||
          d.title.toLowerCase().includes(q) ||
          d.fileName.toLowerCase().includes(q) ||
          (scope === "all" && d.owner.name.toLowerCase().includes(q))),
    );
  }, [documents, category, query, scope]);

  const attention = documents.filter((d) => d.expiry !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="brand" onClick={() => setUploadOpen(true)}>
            <PlusIcon />
            {t("upload")}
          </Button>
        }
      />

      {attention > 0 ? (
        <p className="border-warning/35 bg-warning-soft text-warning-foreground rounded-lg border px-4 py-2.5 text-sm">
          {t("attention", { count: attention })}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Category rail: a vertical list on desktop, scrolling chips on phones. */}
        <nav aria-label={t("allCategories")} className="lg:sticky lg:top-0">
          <p className="eyebrow text-muted-foreground mb-2 hidden px-3 lg:block">
            {t("allCategories")}
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:mx-0 lg:grid lg:gap-1 lg:overflow-visible lg:px-0">
            {(["all", ...STAFF_DOCUMENT_CATEGORIES] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
                className={cn(
                  chipClass(category === key),
                  "lg:h-9 lg:w-full lg:justify-start lg:rounded-lg lg:border-transparent lg:bg-transparent lg:shadow-none",
                  category === key
                    ? "lg:bg-card lg:text-foreground lg:ring-border lg:shadow-xs lg:ring-1"
                    : "lg:hover:bg-card/70",
                )}
              >
                {key === "all" ? t("allCategories") : t(`categories.${key}`)}
              </button>
            ))}
          </div>
        </nav>

        <DataPanel
          toolbar={
            <>
              {canViewAll ? (
                <div role="radiogroup" aria-label={t("scope.label")} className="flex gap-1.5">
                  {(["mine", "all"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={scope === key}
                      onClick={() => switchScope(key)}
                      className={chipClass(scope === key)}
                    >
                      {t(`scope.${key}`)}
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <InputGroup className="bg-background h-9 xl:max-w-72">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("search")}
                />
                {query ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={t("clearSearch")}
                      onClick={() => setQuery("")}
                    >
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </>
          }
        >
          {visible.length === 0 ? (
            <EmptyState
              inset
              className="py-12"
              icon={FolderLockIcon}
              title={documents.length === 0 ? t("empty") : t("noMatches")}
              description={documents.length === 0 ? t("emptyHint") : undefined}
              action={
                documents.length === 0 ? (
                  <Button variant="brand" onClick={() => setUploadOpen(true)}>
                    <PlusIcon />
                    {t("upload")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="bg-muted/35 grid gap-3 p-3 sm:grid-cols-2 sm:p-4 2xl:grid-cols-3">
              {visible.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  showOwner={scope === "all"}
                  onDelete={() => setDeleting(doc)}
                />
              ))}
            </ul>
          )}
        </DataPanel>
      </div>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => void load(scope)}
      />
      <DeleteDocumentDialog
        doc={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => setDocuments((prev) => prev.filter((d) => d.id !== id))}
      />
    </div>
  );
}

function DocumentCard({
  doc,
  showOwner,
  onDelete,
}: {
  doc: StaffDocument;
  showOwner: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("documents");
  const locale = useLocale() as AppLocale;

  return (
    <li className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
          <FileKindIcon mimeType={doc.mimeType} fileName={doc.fileName} className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="truncate font-medium" title={doc.title}>
            {doc.title}
          </p>
          <p className="text-muted-foreground truncate text-xs" title={doc.fileName}>
            {t(`categories.${doc.category}`)} · {formatFileSize(doc.fileSize)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {doc.expiresOn ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-medium",
              doc.expiry === "expired" && "bg-destructive/12 text-destructive",
              doc.expiry === "soon" && "bg-warning-soft text-warning-foreground",
              doc.expiry === null && "bg-muted text-muted-foreground",
            )}
          >
            {doc.expiry === "expired"
              ? t("expired", { date: formatDate(doc.expiresOn, locale, "short") })
              : doc.expiry === "soon"
                ? t("expiresIn", { count: doc.daysLeft ?? 0 })
                : t("expires", { date: formatDate(doc.expiresOn, locale, "short") })}
          </span>
        ) : null}
        <span className="text-muted-foreground">
          {t("uploadedOn", { date: formatDate(doc.createdAt, locale, "short") })}
        </span>
        {showOwner ? <span className="text-muted-foreground">· {doc.owner.name}</span> : null}
      </div>

      {doc.notes ? <p className="text-muted-foreground line-clamp-2 text-sm">{doc.notes}</p> : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer" />
          }
        >
          <EyeIcon />
          {t("view")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<a href={`/api/documents/${doc.id}/file?download=1`} />}
        >
          <DownloadIcon />
          {t("download")}
        </Button>
        {doc.canDelete ? (
          <Button size="sm" variant="ghost" className="text-destructive ms-auto" onClick={onDelete}>
            <Trash2Icon />
            {t("delete")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function DeleteDocumentDialog({
  doc,
  onOpenChange,
  onDeleted,
}: {
  doc: StaffDocument | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("documents");
  const [loading, setLoading] = useState(false);

  async function confirm() {
    if (!doc) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        toast.error(t("errors.deleteFailed"));
        return;
      }
      onDeleted(doc.id);
      toast.success(t("deleted"));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("deleteDescription", { title: doc?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <LoadingButton variant="destructive" loading={loading} onClick={confirm}>
            {t("delete")}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
