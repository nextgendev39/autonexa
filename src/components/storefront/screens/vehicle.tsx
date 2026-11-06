import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheckIcon,
  CalendarIcon,
  CarFrontIcon,
  CheckIcon,
  ChevronRightIcon,
  FuelIcon,
  GaugeIcon,
  MapPinIcon,
  SettingsIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RecentlyViewed } from "@/components/storefront/device-vehicles";
import { EnquiryForm } from "@/components/storefront/enquiry-form";
import { valueLabel } from "@/components/storefront/labels";
import { MobileActionBar, VehicleActions } from "@/components/storefront/vehicle-actions";
import { VehicleCard } from "@/components/storefront/vehicle-card";
import { VehicleGallery } from "@/components/storefront/vehicle-gallery";
import type { SiteView } from "@/lib/storefront/view";
import { getPublicVehicle, similarVehicles } from "@/lib/storefront/vehicles";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";

/** Shown where a field has no value. */
const EMPTY = "–";

export async function VehicleScreen({
  view,
  stockNumber,
}: {
  view: SiteView;
  stockNumber: string;
}) {
  const t = await getTranslations("storefront");
  const { locale } = view;
  const { client } = view;
  const found = await getPublicVehicle(client, stockNumber);
  if (!found) notFound();
  const { id, vehicle } = found;
  const similar = await similarVehicles(client, vehicle);
  await view.track("vehicle_view", {
    path: `/vehicles/${vehicle.stockNumber}`,
    vehicleId: id,
  });

  const listing = view.href("/vehicles");
  const vehicleHref = (stock: string) => view.href(`/vehicles/${encodeURIComponent(stock)}`);
  const price =
    vehicle.price !== null
      ? formatCurrency(vehicle.price, locale, view.currency)
      : t("vehicle.priceOnRequest");
  const mileage =
    vehicle.mileage !== null
      ? `${formatNumber(vehicle.mileage, locale)} ${t(`units.${vehicle.mileageUnit}`)}`
      : null;
  const contact = {
    phone: view.config.contact.phone || vehicle.branch?.phone || null,
    // Most UAE dealerships take WhatsApp on their main number, so that's the fallback.
    whatsapp:
      view.config.contact.whatsapp || view.config.contact.phone || vehicle.branch?.phone || null,
  };

  // The four things buyers look at first. Always all four, with "–" where unknown.
  const highlights: { icon: typeof CalendarIcon; label: string; value: string | null }[] = [
    { icon: CalendarIcon, label: t("specs.year"), value: String(vehicle.year) },
    { icon: GaugeIcon, label: t("specs.mileage"), value: mileage },
    {
      icon: SettingsIcon,
      label: t("specs.transmission"),
      value: valueLabel(t, "transmission", vehicle.transmission),
    },
    { icon: FuelIcon, label: t("specs.fuel"), value: valueLabel(t, "fuel", vehicle.fuelType) },
  ];

  // Every field of the public record, always in the same place. Missing ones show "–", so buyers
  // can see what's unknown rather than wonder whether it was left out.
  const count = (value: number | null) => (value ? formatNumber(value, locale) : null);
  const specGroups: { title: string; rows: [string, string | null][] }[] = [
    {
      title: t("vehicle.overview"),
      rows: [
        [t("specs.make"), vehicle.make],
        [t("specs.model"), vehicle.model],
        [t("specs.variant"), vehicle.variant],
        [t("specs.year"), String(vehicle.year)],
        [t("listing.condition"), valueLabel(t, "condition", vehicle.marketType)],
        [t("specs.grade"), valueLabel(t, "grade", vehicle.condition)],
        [t("specs.mileage"), mileage],
        [t("specs.regionalSpecs"), valueLabel(t, "originType", vehicle.originType)],
        [t("specs.origin"), vehicle.countryOfOrigin],
        [
          t("listing.availability"),
          vehicle.available ? t("vehicle.available") : t("vehicle.reserved"),
        ],
        [
          t("vehicle.branch"),
          [vehicle.branch?.name, vehicle.branch?.city].filter(Boolean).join(" · ") || null,
        ],
        [t("specs.reference"), vehicle.stockNumber],
      ],
    },
    {
      title: t("specs.engineGroup"),
      rows: [
        [t("specs.engine"), vehicle.engineSize],
        [t("specs.cylinders"), count(vehicle.engineCylinders)],
        [t("specs.transmission"), valueLabel(t, "transmission", vehicle.transmission)],
        [t("specs.fuel"), valueLabel(t, "fuel", vehicle.fuelType)],
        [t("specs.drive"), valueLabel(t, "drive", vehicle.driveType)],
      ],
    },
    {
      title: t("specs.bodyGroup"),
      rows: [
        [t("specs.body"), valueLabel(t, "body", vehicle.bodyType)],
        [t("specs.doors"), count(vehicle.doors)],
        [t("specs.seats"), count(vehicle.seats)],
        [t("specs.exterior"), vehicle.exteriorColor],
        [t("specs.interior"), vehicle.interiorColor],
      ],
    },
  ];

  // Built only from the public record, and "<" is escaped so a value can't close the script tag.
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Car",
    name: vehicle.title,
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    vehicleModelDate: String(vehicle.year),
    sku: vehicle.stockNumber,
    itemCondition:
      vehicle.marketType === "new"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
    ...(vehicle.description ? { description: vehicle.description } : {}),
    ...(vehicle.mileage !== null
      ? {
          mileageFromOdometer: {
            "@type": "QuantitativeValue",
            value: vehicle.mileage,
            unitCode: vehicle.mileageUnit === "mi" ? "SMI" : "KMT",
          },
        }
      : {}),
    ...(vehicle.bodyType ? { bodyType: vehicle.bodyType } : {}),
    ...(vehicle.fuelType ? { fuelType: vehicle.fuelType } : {}),
    ...(vehicle.transmission ? { vehicleTransmission: vehicle.transmission } : {}),
    ...(vehicle.exteriorColor ? { color: vehicle.exteriorColor } : {}),
    image: vehicle.photos.map((photo) => photo.url),
    ...(vehicle.price !== null
      ? {
          offers: {
            "@type": "Offer",
            price: vehicle.price,
            priceCurrency: view.currency,
            availability: vehicle.available
              ? "https://schema.org/InStock"
              : "https://schema.org/LimitedAvailability",
            seller: { "@type": "AutoDealer", name: view.name },
          },
        }
      : {}),
  }).replace(/</g, "\\u003c");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />

      <nav
        aria-label={t("vehicle.back")}
        className="text-muted-foreground mb-5 flex flex-wrap items-center gap-1.5 text-sm"
      >
        <Link href={view.href("/")} className="hover:text-foreground">
          {t("nav.home")}
        </Link>
        <ChevronRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
        <Link href={listing} className="hover:text-foreground">
          {t("nav.vehicles")}
        </Link>
        <ChevronRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
        <Link
          href={`${listing}?make=${encodeURIComponent(vehicle.make)}`}
          className="hover:text-foreground"
        >
          {vehicle.make}
        </Link>
        <ChevronRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
        <span className="text-foreground truncate" aria-current="page">
          {vehicle.model}
        </span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
        <div className="grid min-w-0 content-start gap-8">
          <VehicleGallery photos={vehicle.photos} title={vehicle.title} />

          {highlights.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {highlights.map(({ icon: Icon, label, value }) => (
                <li
                  key={label}
                  className="bg-card ring-border flex items-center gap-3 rounded-lg p-3.5 ring-1"
                >
                  <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  <span className="grid min-w-0">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="truncate text-sm font-semibold">{value || EMPTY}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <section className="grid gap-3">
            <h2 className="font-heading text-xl font-semibold">{t("vehicle.description")}</h2>
            <p className="text-muted-foreground leading-relaxed text-pretty whitespace-pre-line">
              {vehicle.description || EMPTY}
            </p>
          </section>

          <section className="grid gap-3">
            <h2 className="font-heading text-xl font-semibold">{t("vehicle.features")}</h2>
            {vehicle.features.length ? (
              <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {vehicle.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "var(--sf-accent)", color: "var(--sf-on-accent)" }}
                    >
                      <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{EMPTY}</p>
            )}
          </section>

          <section className="grid gap-5">
            <h2 className="font-heading text-xl font-semibold">{t("vehicle.details")}</h2>
            {specGroups.map((group) => (
              <div key={group.title} className="grid gap-2">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                  {group.title}
                </h3>
                <dl className="ring-border bg-card grid overflow-hidden rounded-lg ring-1 sm:grid-cols-2">
                  {group.rows.map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-card border-border flex justify-between gap-4 border-b px-4 py-3 text-sm sm:odd:border-e"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd
                        className={
                          value ? "text-end font-medium" : "text-muted-foreground text-end"
                        }
                      >
                        {value || EMPTY}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        </div>

        <aside className="grid content-start gap-5 lg:sticky lg:top-20 lg:self-start">
          <div className="bg-card ring-border grid gap-4 rounded-lg p-5 shadow-sm ring-1">
            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase"
                style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              >
                {valueLabel(t, "condition", vehicle.marketType)}
              </span>
              <span
                className={
                  vehicle.available
                    ? "rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                    : "bg-muted rounded-full px-2.5 py-0.5 text-xs font-semibold"
                }
              >
                {vehicle.available ? t("vehicle.available") : t("vehicle.reserved")}
              </span>
            </div>
            <div>
              <h1 className="font-heading text-2xl leading-tight font-semibold text-balance">
                {vehicle.title}
              </h1>
              <p className="font-heading mt-3 text-3xl font-semibold">{price}</p>
              {vehicle.available ? null : (
                <p className="text-muted-foreground mt-2 text-sm">{t("vehicle.reservedHint")}</p>
              )}
            </div>
            <VehicleActions
              stockNumber={vehicle.stockNumber}
              title={vehicle.title}
              contact={contact}
            />
          </div>

          <div className="bg-card ring-border grid gap-3 rounded-lg p-5 ring-1">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("vehicle.dealer")}
            </p>
            <p className="flex items-center gap-2 font-semibold">
              <BadgeCheckIcon
                className="size-4.5"
                style={{ color: "var(--sf-accent)" }}
                aria-hidden
              />
              {view.name}
            </p>
            {vehicle.branch ? (
              <p className="text-muted-foreground flex items-start gap-2 text-sm">
                <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {[vehicle.branch.name, vehicle.branch.city].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <Link
              href={view.href("/contact")}
              className="w-fit text-sm font-semibold underline-offset-4 hover:underline"
            >
              {t("contact.title")}
            </Link>
          </div>

          <section
            id="enquire"
            className="bg-card ring-border grid scroll-mt-24 gap-4 rounded-lg p-5 ring-1"
          >
            <h2 className="font-heading text-lg font-semibold">{t("enquiry.title")}</h2>
            <EnquiryForm
              stockNumber={vehicle.stockNumber}
              locale={locale}
              canRequestBooking={view.bookingEnabled && vehicle.available}
              api={view.api}
            />
          </section>
        </aside>
      </div>

      {similar.length ? (
        <section className="mt-16 grid gap-6">
          <h2 className="font-heading text-2xl font-semibold">{t("vehicle.similar")}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((item) => (
              <VehicleCard
                key={item.stockNumber}
                vehicle={item}
                locale={locale}
                currency={view.currency}
                href={vehicleHref(item.stockNumber)}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-16 flex justify-center">
          <Link
            href={listing}
            className="inline-flex items-center gap-2 text-sm font-semibold hover:underline"
          >
            <CarFrontIcon className="size-4" aria-hidden />
            {t("nav.browseAll")}
          </Link>
        </div>
      )}

      <div className="mt-16">
        <RecentlyViewed
          title={t("home.recent")}
          exclude={vehicle.stockNumber}
          locale={locale}
          currency={view.currency}
          vehicleBase={listing}
          api={view.api}
        />
      </div>

      <MobileActionBar
        stockNumber={vehicle.stockNumber}
        title={vehicle.title}
        price={price}
        contact={contact}
      />
    </div>
  );
}
