import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { EnquiryForm } from "@/components/storefront/enquiry-form";
import { VehicleGallery } from "@/components/storefront/vehicle-gallery";
import type { AppLocale } from "@/config/app";
import { sitePath } from "@/lib/storefront/host";
import { requireSite, siteClient, trackEvent } from "@/lib/storefront/site";
import { getPublicVehicle } from "@/lib/storefront/vehicles";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ stock: string }> };

const stockFrom = async (params: Props["params"]) => decodeURIComponent((await params).stock);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await requireSite();
  const found = await getPublicVehicle(siteClient(site), await stockFrom(params));
  if (!found) return { title: { absolute: site.displayName }, robots: { index: false } };
  const locale = await getLocale();
  const { vehicle } = found;
  const path = `/vehicles/${encodeURIComponent(vehicle.stockNumber)}`;
  const cover = vehicle.photos[0]?.url;
  const description = vehicle.price !== null ? `${vehicle.title} · ${formatCurrency(vehicle.price, locale as AppLocale, site.currency)}` : vehicle.title;
  return {
    title: vehicle.title,
    description,
    alternates: {
      canonical: sitePath(locale, path, site.defaultLocale),
      languages: { en: sitePath("en", path, site.defaultLocale), ar: sitePath("ar", path, site.defaultLocale) },
    },
    openGraph: { title: vehicle.title, description, type: "website", ...(cover ? { images: [{ url: cover }] } : {}) },
    twitter: { card: cover ? "summary_large_image" : "summary", title: vehicle.title, description },
  };
}

export default async function Page({ params }: Props) {
  const site = await requireSite();
  const t = await getTranslations("storefront");
  const locale = (await getLocale()) as AppLocale;
  const found = await getPublicVehicle(siteClient(site), await stockFrom(params));
  if (!found) notFound();
  const { id, vehicle } = found;
  await trackEvent(site, "vehicle_view", { path: `/vehicles/${vehicle.stockNumber}`, vehicleId: id });

  const specs: [string, string | null][] = [
    [t("specs.year"), String(vehicle.year)],
    [t("specs.mileage"), vehicle.mileage !== null ? `${formatNumber(vehicle.mileage, locale)} ${t(`units.${vehicle.mileageUnit}`)}` : null],
    [t("specs.body"), vehicle.bodyType],
    [t("specs.transmission"), vehicle.transmission],
    [t("specs.fuel"), vehicle.fuelType],
    [t("specs.drive"), vehicle.driveType],
    [t("specs.engine"), vehicle.engineSize],
    [t("specs.cylinders"), vehicle.engineCylinders ? String(vehicle.engineCylinders) : null],
    [t("specs.seats"), vehicle.seats ? String(vehicle.seats) : null],
    [t("specs.doors"), vehicle.doors ? String(vehicle.doors) : null],
    [t("specs.exterior"), vehicle.exteriorColor],
    [t("specs.interior"), vehicle.interiorColor],
    [t("specs.origin"), vehicle.countryOfOrigin],
    [t("specs.reference"), vehicle.stockNumber],
  ];
  // Built only from the public record, and "<" is escaped so a value can't close the script tag.
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Car",
    name: vehicle.title,
    brand: vehicle.make,
    model: vehicle.model,
    vehicleModelDate: String(vehicle.year),
    sku: vehicle.stockNumber,
    image: vehicle.photos.map((photo) => photo.url),
    ...(vehicle.price !== null
      ? {
          offers: {
            "@type": "Offer",
            price: vehicle.price,
            priceCurrency: site.currency,
            availability: vehicle.available ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
          },
        }
      : {}),
  }).replace(/</g, "\\u003c");

  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />
      <div className="grid content-start gap-6">
        <Link href={sitePath(locale, "/vehicles", site.defaultLocale)} className="text-sm hover:underline">
          {t("vehicle.back")}
        </Link>
        <VehicleGallery photos={vehicle.photos} title={vehicle.title} />
        <section className="grid gap-3">
          <h2 className="font-heading text-xl font-semibold">{t("vehicle.details")}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {specs.flatMap(([label, value]) =>
              value ? [
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>,
              ] : [],
            )}
          </dl>
        </section>
      </div>
      <aside className="grid content-start gap-5">
        <div className="grid gap-2">
          <h1 className="font-heading text-2xl font-semibold text-balance">{vehicle.title}</h1>
          <p className="text-2xl font-semibold">
            {vehicle.price !== null ? formatCurrency(vehicle.price, locale, site.currency) : t("vehicle.priceOnRequest")}
          </p>
          {vehicle.available ? null : <p className="text-muted-foreground text-sm">{t("vehicle.reservedHint")}</p>}
          {vehicle.branch ? (
            <p className="text-muted-foreground text-sm">{[vehicle.branch.name, vehicle.branch.city].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <section className="bg-card ring-border grid gap-4 rounded-xl p-5 ring-1">
          <h2 className="font-heading text-lg font-semibold">{t("enquiry.title")}</h2>
          <EnquiryForm
            stockNumber={vehicle.stockNumber}
            locale={locale}
            canRequestBooking={site.bookingEnabled && vehicle.available}
          />
        </section>
      </aside>
    </div>
  );
}
