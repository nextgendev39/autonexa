"use client";

import Link from "next/link";
import {
  CalendarIcon,
  CameraIcon,
  CarFrontIcon,
  FuelIcon,
  GaugeIcon,
  MapPinIcon,
  SettingsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { valueLabel } from "@/components/storefront/labels";
import { SaveButton } from "@/components/storefront/save-button";
import type { AppLocale } from "@/config/app";
import type { PublicVehicle } from "@/lib/storefront/public-vehicle";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

export function VehicleCard({
  vehicle,
  locale,
  currency,
  href,
  className,
}: {
  vehicle: PublicVehicle;
  locale: AppLocale;
  currency: string;
  href: string;
  className?: string;
}) {
  const t = useTranslations("storefront");
  const photo = vehicle.photos[0]?.url;
  const specs = [
    { icon: CalendarIcon, text: String(vehicle.year) },
    vehicle.mileage !== null
      ? {
          icon: GaugeIcon,
          text: `${formatNumber(vehicle.mileage, locale)} ${t(`units.${vehicle.mileageUnit}`)}`,
        }
      : null,
    vehicle.transmission
      ? { icon: SettingsIcon, text: valueLabel(t, "transmission", vehicle.transmission) }
      : null,
    vehicle.fuelType ? { icon: FuelIcon, text: valueLabel(t, "fuel", vehicle.fuelType) } : null,
  ].filter((item): item is { icon: typeof CalendarIcon; text: string } => Boolean(item?.text));

  return (
    <article
      className={cn(
        "group bg-card ring-border relative flex flex-col overflow-hidden rounded-lg ring-1 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img
            src={photo}
            alt={vehicle.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <CarFrontIcon className="size-10" aria-hidden />
          </div>
        )}
        <div className="absolute start-2.5 top-2.5 flex flex-wrap gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
            style={
              vehicle.marketType === "new"
                ? { background: "var(--sf-accent)", color: "var(--sf-on-accent)" }
                : { background: "var(--sf-primary)", color: "var(--sf-on-primary)" }
            }
          >
            {valueLabel(t, "condition", vehicle.marketType)}
          </span>
          {vehicle.available ? null : (
            <span className="bg-background/95 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase">
              {t("vehicle.reserved")}
            </span>
          )}
        </div>
        {vehicle.photos.length > 1 ? (
          <span className="absolute start-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            <CameraIcon className="size-3" aria-hidden />
            {vehicle.photos.length}
          </span>
        ) : null}
        <SaveButton
          stockNumber={vehicle.stockNumber}
          title={vehicle.title}
          className="absolute end-2.5 top-2.5 z-10"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-1 font-semibold">
            {/* The whole card is the link; the save button sits above it. */}
            <Link
              href={href}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {[vehicle.make, vehicle.model].join(" ")}
            </Link>
          </h3>
          <p className="text-muted-foreground line-clamp-1 text-sm">
            {vehicle.variant || valueLabel(t, "body", vehicle.bodyType) || "\u00a0"}
          </p>
        </div>
        <p
          className="font-heading text-xl font-semibold"
          style={{ color: "var(--sf-price, inherit)" }}
        >
          {vehicle.price !== null
            ? formatCurrency(vehicle.price, locale, currency)
            : t("vehicle.priceOnRequest")}
        </p>
        {specs.length ? (
          <ul className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {specs.map(({ icon: Icon, text }) => (
              <li key={text} className="flex min-w-0 items-center gap-1.5">
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {vehicle.branch?.city || vehicle.branch?.name ? (
          <p className="text-muted-foreground border-border mt-auto flex items-center gap-1.5 border-t pt-3 text-xs">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{vehicle.branch.city || vehicle.branch.name}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
