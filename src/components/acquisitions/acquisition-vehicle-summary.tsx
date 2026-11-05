"use client";

import { useTranslations } from "next-intl";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";
import type { AcquisitionDetail } from "@/types/acquisition";
import { vehicleHref } from "@/lib/vehicles/routes";

export function AcquisitionVehicleSummary({ acquisition }: { acquisition: AcquisitionDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();

  const title =
    [acquisition.vehicleYear, acquisition.vehicleMake, acquisition.vehicleModel]
      .filter(Boolean)
      .join(" ") || t("acquisitions.fields.notSet");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{t("acquisitions.sections.linkedVehicle")}</CardTitle>
        {acquisition.vehicleId ? (
          <Link
            href={
              acquisition.vehicleStockNumber
                ? vehicleHref(acquisition.vehicleStockNumber)
                : `/inventory/${acquisition.vehicleId}`
            }
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("acquisitions.actions.viewVehicle")}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("acquisitions.fields.vehicle")}</dt>
            <dd className="text-sm font-medium">{title}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("acquisitions.fields.stockNumber")}</dt>
            <dd className="text-sm tabular-nums">{acquisition.vehicleStockNumber || "—"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("acquisitions.fields.vin")}</dt>
            <dd className="font-mono text-sm">{acquisition.vehicleVin || "—"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("acquisitions.fields.mileage")}</dt>
            <dd className="text-sm tabular-nums">
              {acquisition.vehicleMileage != null
                ? formatNumber(acquisition.vehicleMileage, locale)
                : "—"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("acquisitions.fields.variant")}</dt>
            <dd className="text-sm">{acquisition.vehicleVariant || "—"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("acquisitions.fields.origin")}</dt>
            <dd className="text-sm">
              {acquisition.vehicleOriginType
                ? t.has(`inventory.enums.origin.${acquisition.vehicleOriginType}`)
                  ? t(`inventory.enums.origin.${acquisition.vehicleOriginType}`)
                  : acquisition.vehicleOriginType
                : "—"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
