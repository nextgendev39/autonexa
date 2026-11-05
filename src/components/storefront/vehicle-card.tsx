import Link from "next/link";
import { CarFrontIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { AppLocale } from "@/config/app";
import type { PublicVehicle } from "@/lib/storefront/public-vehicle";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

export async function VehicleCard({
  vehicle,
  locale,
  currency,
  href,
}: {
  vehicle: PublicVehicle;
  locale: AppLocale;
  currency: string;
  href: string;
}) {
  const t = await getTranslations("storefront");
  const photo = vehicle.photos[0]?.url;
  return (
    <Link
      href={href}
      className="bg-card group ring-border flex flex-col overflow-hidden rounded-xl ring-1 transition-shadow hover:shadow-md focus-visible:ring-2"
    >
      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img src={photo} alt={vehicle.title} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <CarFrontIcon className="size-10" aria-hidden />
          </div>
        )}
        {vehicle.available ? null : (
          <span className="bg-background/90 absolute start-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium">
            {t("vehicle.reserved")}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-medium text-pretty">{vehicle.title}</h3>
        {vehicle.mileage !== null ? (
          <p className="text-muted-foreground text-sm">
            {formatNumber(vehicle.mileage, locale)} {t(`units.${vehicle.mileageUnit}`)}
          </p>
        ) : null}
        <p className="mt-auto pt-2 text-lg font-semibold">
          {vehicle.price !== null ? formatCurrency(vehicle.price, locale, currency) : t("vehicle.priceOnRequest")}
        </p>
      </div>
    </Link>
  );
}
