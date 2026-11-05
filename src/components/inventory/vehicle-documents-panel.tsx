"use client";

import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailCardSkeleton, DocumentsPanelSkeleton } from "@/components/feedback/skeletons";
import { usePermission } from "@/hooks/use-permission";
import { useVehicleDocuments } from "@/hooks/use-vehicle-documents";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import {
  VEHICLE_DOCUMENT_SOURCES,
  type VehicleDocumentItem,
  type VehicleDocumentSource,
} from "@/types/vehicle-document";

type Filter = "all" | VehicleDocumentSource;

function formatBytes(bytes: number | null) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(item: VehicleDocumentItem) {
  const mime = (item.mimeType ?? "").toLowerCase();
  if (item.kind === "photo" || mime.startsWith("image/")) return "image";
  if (mime.includes("pdf")) return "pdf";
  return "other";
}

function DocumentCard({
  item,
  locale,
  showAmount,
}: {
  item: VehicleDocumentItem;
  locale: "en" | "ar";
  showAmount: boolean;
}) {
  const t = useTranslations();
  const kind = fileKind(item);
  const size = formatBytes(item.fileSize);
  const categoryKey = `acquisitions.documents.categories.${item.category}`;
  const categoryLabel =
    item.source === "acquisition" && t.has(categoryKey)
      ? t(categoryKey)
      : item.categoryLabel;

  return (
    <li className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`inventory.documents.sources.${item.source}`)}</Badge>
            <span className="text-muted-foreground text-xs">{categoryLabel}</span>
          </div>
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-muted-foreground text-xs">
            {[
              kind === "pdf" ? "PDF" : kind === "image" ? t("inventory.documents.image") : null,
              size,
              formatDate(item.createdAt, locale, "medium"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {item.createdByName ? (
            <p className="text-muted-foreground text-xs">
              {t("inventory.documents.uploadedBy", { name: item.createdByName })}
            </p>
          ) : null}
          {showAmount && item.amount != null ? (
            <p className="text-sm font-medium tabular-nums">
              {formatCurrency(item.amount, locale, item.currency ?? undefined)}
            </p>
          ) : null}
        </div>
        <div className="text-muted-foreground shrink-0">
          {kind === "image" ? <ImageIcon className="size-5" aria-hidden /> : <FileTextIcon className="size-5" aria-hidden />}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.url ? (
          <>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              <ExternalLinkIcon className="size-4" aria-hidden />
              {t("inventory.documents.view")}
            </a>
            <a
              href={item.url}
              download={item.name}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              <DownloadIcon className="size-4" aria-hidden />
              {t("inventory.documents.download")}
            </a>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{t("inventory.documents.unavailable")}</p>
        )}
      </div>
    </li>
  );
}

export function VehicleDocumentsPanel({ vehicleId }: { vehicleId: string }) {
  const { can } = usePermission();
  const t = useTranslations();
  const locale = useAppLocale();
  const query = useVehicleDocuments(vehicleId);
  const [filter, setFilter] = useState<Filter>("all");

  const items = useMemo(() => {
    const all = query.data?.documents.items ?? [];
    if (filter === "all") return all;
    return all.filter((item) => item.source === filter);
  }, [filter, query.data?.documents.items]);

  if (query.isPending) return <DocumentsPanelSkeleton />;
  if (query.isError) {
    return (
      <EmptyState
        title={t("inventory.documents.loadFailed")}
        description={query.error.message}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCwIcon aria-hidden />
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const docs = query.data!.documents;
  const costs = query.data!.costs;
  const counts = docs.counts;

  return (
    <div className="grid gap-4">
      {costs?.canView ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("inventory.documents.costSummaryTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("inventory.documents.purchaseCost")}</dt>
                <dd className="font-medium tabular-nums">
                  {formatCurrency(costs.purchaseCost ?? 0, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("inventory.documents.acquisitionExpenses")}</dt>
                <dd className="font-medium tabular-nums">
                  {formatCurrency(costs.acquisitionExpenses ?? 0, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-border/60 pt-2 font-medium sm:col-span-2">
                <dt>{t("inventory.documents.totalCost")}</dt>
                <dd className="tabular-nums">
                  {formatCurrency(costs.totalVehicleCost ?? 0, locale)}
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-2 text-xs">
              {t("inventory.documents.costSummaryHint")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>
            {t("inventory.documents.title")} ({counts.all})
          </CardTitle>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(["all", ...VEHICLE_DOCUMENT_SOURCES] as Filter[])
              // Purchase paperwork is acquisition-only; don't advertise an empty filter.
              .filter((item) => item !== "acquisition" || can("acquisition.view"))
              .map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={filter === item ? "default" : "outline"}
                className="shrink-0"
                onClick={() => setFilter(item)}
              >
                {t(`inventory.documents.filters.${item}`)}{" "}
                {item === "all" ? counts.all : counts[item]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {Object.entries(docs.errors).map(([source, message]) => (
            <Alert key={source}>
              <AlertTitle>
                {t("inventory.documents.sourceLoadFailed", {
                  source: t(`inventory.documents.sources.${source}`),
                })}
              </AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ))}

          {items.length === 0 ? (
            <EmptyState
              icon={FileTextIcon}
              title={
                filter === "all"
                  ? t("inventory.documents.emptyTitle")
                  : t("inventory.documents.emptySource", {
                      source: t(`inventory.documents.sources.${filter}`),
                    })
              }
              description={t("inventory.documents.emptyHint")}
            />
          ) : (
            <ul className="grid gap-3">
              {items.map((item) => (
                <DocumentCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  showAmount={Boolean(costs?.canView)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function VehicleCostsPanel({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const query = useVehicleDocuments(vehicleId);

  if (query.isPending) return <DetailCardSkeleton />;
  if (query.isError || !query.data?.costs) {
    return (
      <EmptyState
        title={t("inventory.documents.costLoadFailed")}
        description={t("inventory.documents.emptyHint")}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const costs = query.data.costs;
  if (!costs.canView) {
    return (
      <EmptyState
        title={t("inventory.placeholders.restricted")}
        description={t("inventory.documents.costRestricted")}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inventory.documents.costSummaryTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("inventory.documents.purchaseCost")}</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(costs.purchaseCost ?? 0, locale)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("inventory.documents.acquisitionExpenses")}</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(costs.acquisitionExpenses ?? 0, locale)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t("inventory.documents.otherCosts")}</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(costs.otherCosts ?? 0, locale)}
          </span>
        </div>
        <div className="flex justify-between gap-2 border-t border-border/60 pt-2 font-medium">
          <span>{t("inventory.documents.totalCost")}</span>
          <span className="tabular-nums">
            {formatCurrency(costs.totalVehicleCost ?? 0, locale)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{t("inventory.documents.costSummaryHint")}</p>
      </CardContent>
    </Card>
  );
}
