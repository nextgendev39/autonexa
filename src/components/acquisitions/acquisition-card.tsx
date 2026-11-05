"use client";

import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AcquisitionStatusBadge } from "@/components/acquisitions/acquisition-status-badge";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { Card, CardContent } from "@/components/ui/card";
import { usePermission } from "@/hooks/use-permission";
import { Link } from "@/lib/i18n/navigation";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import type { AcquisitionListItem } from "@/types/acquisition";

function vehicleLabel(item: AcquisitionListItem) {
  return [item.vehicleYear, item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ") || "—";
}

export function AcquisitionCard({ acquisition }: { acquisition: AcquisitionListItem }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { can } = usePermission();
  const showCost =
    (can("acquisition.cost.view") || can("vehicle.cost.view")) && acquisition.purchasePrice != null;

  return (
    <Link
      href={`/acquisitions/${acquisition.id}`}
      className="focus-visible:ring-ring/50 group/acq block h-full rounded-xl outline-none focus-visible:ring-3"
    >
      <Card className="hover:ring-brand/30 h-full gap-0 py-0 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="grid h-full content-start gap-2 p-3.5 sm:gap-3 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground font-mono text-xs tabular-nums">
              {acquisition.acquisitionNumber}
            </p>
            <AcquisitionStatusBadge status={acquisition.status} />
          </div>
          <p className="group-hover/acq:text-brand truncate font-semibold tracking-tight transition-colors sm:text-base">
            {vehicleLabel(acquisition)}
          </p>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs sm:text-sm">
            <span>{t(`acquisitions.sourceTypes.${acquisition.sourceType}`)}</span>
            {acquisition.purchaseDate ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {formatDate(acquisition.purchaseDate, locale, "short")}
                </span>
              </>
            ) : null}
          </p>
          <div className="mt-auto flex items-center justify-between gap-3 border-t pt-2 text-xs sm:pt-3 sm:text-sm">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {acquisition.branchName || t("acquisitions.fields.notSet")}
              </span>
            </span>
            {showCost ? (
              <span className="font-heading shrink-0 text-sm font-semibold tabular-nums sm:text-base">
                {formatCurrency(acquisition.purchasePrice as number, locale)}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
