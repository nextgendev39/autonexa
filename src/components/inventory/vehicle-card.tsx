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
    <span className="bg-card/95 inline-flex rounded-full shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:ring-white/10">
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
    // h-full + flex column: every card in a grid row is the same height and the action bar
    // lines up along the bottom. Phones get a compact horizontal card: photo on the side.
    <Card className="group/vehicle hover:ring-brand/45 flex h-full flex-col gap-0 overflow-hidden py-0 hover:shadow-md">
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
              className="size-full object-cover transition-transform duration-500 ease-(--ease-standard) group-hover/vehicle:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <VehiclePhotoPlaceholder className="sm:pt-8" />
          )}
          {/* Scrims top and bottom so the chips and the price plate read on any photo. */}
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgb(8_10_15/0.35),transparent_28%,transparent_62%,rgb(8_10_15/0.55))] max-sm:hidden"
            aria-hidden
          />
          {sold ? (
            <div className="sm:hidden">
              <SoldRibbon size="sm" />
            </div>
          ) : null}
          {sold ? (
            <div className="max-sm:hidden">
              <SoldRibbon size="md" />
              <div className="absolute start-3 top-3">
                <Chip>
                  <MarketTypeBadge value={vehicle.marketType} />
                </Chip>
              </div>
            </div>
          ) : (
            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2 max-sm:hidden">
              <Chip>
                <VehicleStatusBadge status={vehicle.status} />
              </Chip>
              <Chip>
                <MarketTypeBadge value={vehicle.marketType} />
              </Chip>
            </div>
          )}
          {/* Price plate: obsidian glass with a champagne figure. */}
          {showPrice ? (
            <div className="absolute start-3 bottom-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-[#111318]/80 px-3 py-1.5 text-white shadow-sm ring-1 ring-white/10 backdrop-blur-md max-sm:hidden [&_.text-muted-foreground]:text-white/65">
              <VehiclePrice vehicle={vehicle} amountClassName="figure text-base text-[#e8d5a9]" />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-4 max-sm:gap-1.5 max-sm:p-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
            {sold ? null : <VehicleStatusBadge status={vehicle.status} />}
            <MarketTypeBadge value={vehicle.marketType} className="h-5 px-1.5 text-[11px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-subtle-foreground font-mono text-[11px] tracking-wide">
                {vehicle.stockNumber}
              </p>
              {vehicle.quantity > 1 ? (
                <span className="bg-gold-soft text-premium-foreground border-gold/25 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                  <LayersIcon className="size-3" aria-hidden />
                  {t("inventory.quantity.units", { count: vehicle.quantity })}
                </span>
              ) : (
                <span className="text-subtle-foreground inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
                  <LayersIcon className="size-3" aria-hidden />
                  {t("inventory.quantity.units", { count: vehicle.quantity })}
                </span>
              )}
            </div>
            <p className="font-heading group-hover/vehicle:text-brand mt-1 truncate text-[0.9375rem] font-semibold tracking-[-0.015em] transition-colors sm:text-base">
              {vehicle.make} {vehicle.model}
            </p>
            {/* Always one line tall so titles line up across the row. */}
            <p className="text-muted-foreground min-h-5 truncate text-sm max-sm:hidden">
              {vehicle.variant ?? " "}
            </p>
          </div>

          {/* Spec strip: equal cells divided by hairlines (phones keep year and mileage). */}
          <ul
            className={cn(
              "divide-divider border-divider grid divide-x rounded-lg border max-sm:hidden rtl:divide-x-reverse",
              specs.length >= 4
                ? "grid-cols-4"
                : specs.length === 3
                  ? "grid-cols-3"
                  : "grid-cols-2",
            )}
          >
            {specs.map((spec) => (
              <li
                key={spec.value}
                className="flex min-w-0 flex-col items-center gap-1 px-1 py-2 text-center text-[11px] leading-tight tabular-nums"
              >
                <spec.icon className="text-brand size-3.5" aria-hidden />
                <span className="text-foreground/85 w-full truncate">{spec.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground flex gap-2 text-xs tabular-nums sm:hidden">
            {specs.slice(0, 2).map((spec) => (
              <span key={spec.value} className="inline-flex items-center gap-1">
                <spec.icon className="text-brand size-3" aria-hidden />
                {spec.value}
              </span>
            ))}
          </p>

          <div className="mt-auto flex items-end justify-between gap-3 text-sm max-sm:gap-2 max-sm:text-xs">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{place || t("inventory.fields.notSet")}</span>
            </span>
            {showPrice ? (
              <VehiclePrice
                vehicle={vehicle}
                className="shrink-0 text-end sm:hidden"
                amountClassName="figure text-sm"
              />
            ) : null}
          </div>
        </div>
      </Link>

      {/* Book now and Mark as sold share the width; Share and Edit are compact icons beside
          them, and Edit is a full button when there are no sale actions. No actions, no bar. */}
      {sale.any || canEdit || canShare ? (
        <div
          className="border-divider flex items-center gap-2 border-t px-3 py-2.5 max-sm:py-2"
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
