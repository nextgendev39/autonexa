"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AcquisitionCard } from "@/components/acquisitions/acquisition-card";
import { AcquisitionStatusBadge } from "@/components/acquisitions/acquisition-status-badge";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { ResponsiveTable, type TableColumn } from "@/components/tables/responsive-table";
import { buttonVariants } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import type { ListViewMode } from "@/hooks/use-list-view-mode";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import type { AcquisitionListItem } from "@/types/acquisition";

function vehicleLabel(item: AcquisitionListItem) {
  return [item.vehicleYear, item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ") || "—";
}

/** Cards below `md`, table from `md` up (via ResponsiveTable), or forced list/grid. */
export function AcquisitionTable({
  acquisitions,
  viewMode = "auto",
}: {
  acquisitions: AcquisitionListItem[];
  viewMode?: ListViewMode | "auto";
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { can } = usePermission();
  const showCost = can("acquisition.cost.view") || can("vehicle.cost.view");

  const columns = useMemo<TableColumn<AcquisitionListItem>[]>(() => {
    const base: TableColumn<AcquisitionListItem>[] = [
      {
        key: "number",
        header: t("acquisitions.table.number"),
        className: "tabular-nums",
        cell: (row) => (
          <Link
            href={`/acquisitions/${row.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.acquisitionNumber}
          </Link>
        ),
      },
      {
        key: "vehicle",
        header: t("acquisitions.table.vehicle"),
        cell: (row) => (
          <div className="min-w-0">
            <p className="font-medium">{vehicleLabel(row)}</p>
            {row.vehicleVin ? (
              <p className="text-muted-foreground font-mono text-xs">{row.vehicleVin}</p>
            ) : null}
            {row.vehicleStockNumber ? (
              <p className="text-muted-foreground text-xs">{row.vehicleStockNumber}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "source",
        header: t("acquisitions.table.source"),
        cell: (row) => (
          <div>
            <p>{t(`acquisitions.sourceTypes.${row.sourceType}`)}</p>
            {row.sourceName ? (
              <p className="text-muted-foreground text-xs">{row.sourceName}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "branch",
        header: t("acquisitions.table.branch"),
        cell: (row) => row.branchName ?? "—",
      },
    ];

    if (showCost) {
      base.push({
        key: "purchasePrice",
        header: t("acquisitions.table.purchasePrice"),
        className: "tabular-nums text-end",
        cell: (row) =>
          row.purchasePrice != null ? formatCurrency(row.purchasePrice, locale) : "—",
      });
    }

    base.push(
      {
        key: "status",
        header: t("acquisitions.table.status"),
        cell: (row) => <AcquisitionStatusBadge status={row.status} />,
      },
      {
        key: "purchaseDate",
        header: t("acquisitions.table.purchaseDate"),
        className: "tabular-nums",
        cell: (row) =>
          row.purchaseDate ? formatDate(row.purchaseDate, locale, "medium") : "—",
      },
      {
        key: "createdBy",
        header: t("acquisitions.table.createdBy"),
        cell: (row) => row.createdByName ?? "—",
      },
      {
        key: "actions",
        header: t("acquisitions.table.actions"),
        className: "text-end",
        cell: (row) => (
          <Link
            href={`/acquisitions/${row.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            data-row-stop
            onClick={(event) => event.stopPropagation()}
          >
            {t("acquisitions.table.view")}
          </Link>
        ),
      },
    );

    return base;
  }, [t, locale, showCost]);

  return (
    <ResponsiveTable
      columns={columns}
      rows={acquisitions}
      viewMode={viewMode}
      hrefForRow={(acquisition) => `/acquisitions/${acquisition.id}`}
      renderCard={(acquisition) => (
        <AcquisitionCard key={acquisition.id} acquisition={acquisition} />
      )}
    />
  );
}
