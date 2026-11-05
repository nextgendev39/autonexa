"use client";

import {
  CalendarIcon,
  CogIcon,
  FuelIcon,
  GaugeIcon,
  LayersIcon,
  MapPinIcon,
  PencilIcon,
} from "lucide-react";
import { VehiclePhotoPlaceholder } from "@/components/inventory/vehicle-photo-placeholder";
import { useTranslations } from "next-intl";

import { enumLabel, useAppLocale, vehicleTitle } from "@/components/inventory/inventory-utils";
import { MarketTypeBadge } from "@/components/inventory/market-type-badge";
import { ShareVehicleButton, isShareableStatus } from "@/components/inventory/share-vehicle-button";
import { VehiclePrice, listPrice } from "@/components/inventory/vehicle-price";
import { VehicleStatusBadge } from "@/components/inventory/vehicle-status-badge";
import { SoldRibbon } from "@/components/inventory/vehicle-sold-tag";
import { isSoldStatus } from "@/lib/vehicles/status-transitions";
import { VehicleSaleActions, useSaleActions } from "@/components/inventory/vehicle-sale-actions";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePermission } from "@/hooks/use-permission";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";
import { vehicleHref } from "@/lib/vehicles/routes";
import type { VehicleListItem } from "@/types/vehicle";

/**
 * Chips sit on a solid pill so they stay readable on any photo — the badges' own
 * tinted backgrounds are only ~10% opaque and vanish on white studio shots.
 */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-background/95 inline-flex rounded-full shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:ring-white/10">
      {children}
    </span>
  );
}

export function VehicleCard({ vehicle }: { vehicle: VehicleListItem }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { can } = usePermission();
  const showPrice = can("vehicle.price.view") && listPrice(vehicle) != null;
  const place = [vehicle.branchName, vehicle.locationName].filter(Boolean).join(" · ");
  const sale = useSaleActions(vehicle);
  const sold = isSoldStatus(vehicle.status);
  const canEdit = can("vehicle.edit") && !sold;
  const canShare = can("vehicle.price.view") && isShareableStatus(vehicle.status);

  const specs = [
    { icon: CalendarIcon, value: String(vehicle.year) },
    {
      icon: GaugeIcon,
      value: `${formatNumber(vehicle.mileage, locale)} ${t(`inventory.enums.mileageUnit.${vehicle.mileageUnit}`)}`,
    },
    { icon: CogIcon, value: enumLabel(t, "transmission", vehicle.transmission) },
    { icon: FuelIcon, value: enumLabel(t, "fuel", vehicle.fuelType) },
  ].filter((spec): spec is { icon: typeof CalendarIcon; value: string } => !!spec.value);

  return (
    // h-full + flex column: every card in a grid row is the same height and the
    // price/location row and action bar line up along the bottom. Phones get a compact
    // horizontal card: photo on the side, status inside the details.
    <Card className="group/vehicle hover:ring-brand/30 flex h-full flex-col gap-0 overflow-hidden py-0 hover:-translate-y-1 hover:shadow-lg">
      <Link
        href={vehicleHref(vehicle.stockNumber)}
        className="focus-visible:ring-ring/50 flex flex-1 outline-none focus-visible:ring-3 max-sm:flex-row sm:flex-col"
      >
        <div className="bg-muted relative shrink-0 overflow-hidden max-sm:min-h-28 max-sm:w-28 max-sm:self-stretch sm:aspect-[16/10] sm:w-full">
          {vehicle.primaryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={vehicle.primaryPhotoUrl}
              alt={vehicleTitle(vehicle)}
              className="size-full object-cover transition-transform duration-700 ease-(--ease-out-expo) group-hover/vehicle:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <VehiclePhotoPlaceholder className="sm:pt-8" />
          )}
          {/* Soft scrim behind the chips for extra separation on busy photos. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/30 to-transparent max-sm:hidden"
            aria-hidden
          />
          {/* Sold cars get the corner ribbon instead of a status chip, so the condition
              chip moves to the free corner. */}
          {/* Phones keep the Sold ribbon, sized for the small side photo. */}
          {sold ? (
            <div className="sm:hidden">
              <SoldRibbon size="sm" />
            </div>
          ) : null}
          {sold ? (
            <div className="max-sm:hidden">
              <SoldRibbon size="md" />
              <div className="absolute start-2.5 top-2.5">
                <Chip>
                  <MarketTypeBadge value={vehicle.marketType} />
                </Chip>
              </div>
            </div>
          ) : (
            <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2 max-sm:hidden">
              <Chip>
                <VehicleStatusBadge status={vehicle.status} />
              </Chip>
              <Chip>
                <MarketTypeBadge value={vehicle.marketType} />
              </Chip>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 max-sm:gap-1.5 max-sm:p-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
            {/* Sold cars already say so on the photo ribbon. */}
            {sold ? null : <VehicleStatusBadge status={vehicle.status} />}
            <MarketTypeBadge value={vehicle.marketType} className="h-5 px-1.5 text-[11px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground font-mono text-xs">{vehicle.stockNumber}</p>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                  vehicle.quantity > 1
                    ? "bg-violet-500/10 text-violet-800 dark:text-violet-200"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                <LayersIcon className="size-3.5" aria-hidden />
                {t("inventory.quantity.units", { count: vehicle.quantity })}
              </span>
            </div>
            <p className="group-hover/vehicle:text-brand truncate font-semibold tracking-tight transition-colors sm:text-base">
              {vehicle.make} {vehicle.model}
            </p>
            {/* Always one line tall so titles line up across the row. */}
            <p className="text-muted-foreground min-h-5 truncate text-sm max-sm:hidden">
              {vehicle.variant ?? " "}
            </p>
          </div>

          <ul className="flex flex-wrap gap-1.5 max-sm:gap-1">
            {specs.map((spec, index) => (
              <li
                key={spec.value}
                className={cn(
                  "bg-muted/60 text-foreground/80 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs tabular-nums max-sm:px-1.5 max-sm:py-0.5",
                  // Phones keep year and mileage; the rest is on the vehicle page.
                  index > 1 && "max-sm:hidden",
                )}
              >
                <spec.icon className="text-brand size-3.5" aria-hidden />
                {spec.value}
              </li>
            ))}
          </ul>

          <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3 text-sm max-sm:gap-2 max-sm:border-0 max-sm:pt-1 max-sm:text-xs">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{place || t("inventory.fields.notSet")}</span>
            </span>
            {showPrice ? (
              <VehiclePrice
                vehicle={vehicle}
                className="shrink-0 text-end"
                amountClassName="font-heading text-sm font-semibold sm:text-base"
              />
            ) : null}
          </div>
        </div>
      </Link>

      {/* Book now and Mark as sold share the width; Share and Edit are compact icons beside
          them, and Edit is a full button when there are no sale actions. No actions, no bar. */}
      {sale.any || canEdit || canShare ? (
        <div
          className="bg-muted/30 flex items-center gap-2 border-t px-3 py-2.5 max-sm:py-2"
          data-row-stop
        >
          <VehicleSaleActions vehicle={vehicle} layout="card" />
          {canShare ? <ShareVehicleButton vehicle={vehicle} /> : null}
          {canEdit ? (
            <Link
              href={vehicleHref(vehicle.stockNumber, "/edit")}
              className={cn(
                buttonVariants({ variant: "outline", size: sale.any ? "icon-sm" : "sm" }),
                sale.any ? "size-9 shrink-0" : "h-9 flex-1",
              )}
              aria-label={t("inventory.actions.edit")}
              title={t("inventory.actions.edit")}
              onClick={(event) => event.stopPropagation()}
            >
              <PencilIcon className="size-4" aria-hidden />
              {sale.any ? null : t("inventory.actions.edit")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
