import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  CalendarIcon,
  CarFrontIcon,
  CogIcon,
  FuelIcon,
  GaugeIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/navigation/language-switcher";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { BrandMark } from "@/components/shared/brand-mark";
import { appConfig, isAppLocale, type AppLocale } from "@/config/app";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { countryFlag, findCountryByName } from "@/lib/vehicles/countries";
import { getSharedVehicle, recordShareView, type SharedVehicle } from "@/lib/vehicles/share";

type Props = { params: Promise<{ token: string }> };

// Photo URLs are signed per request, so this page is never cached.
export const dynamic = "force-dynamic";

function title(v: Pick<SharedVehicle, "year" | "make" | "model" | "variant">) {
  return [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const t = await getTranslations("share");
  const result = await getSharedVehicle(token);
  const robots = { index: false, follow: false };
  if (result.status !== "ok") return { title: t("unavailableTitle"), robots };

  const name = title(result.vehicle);
  const cover = result.vehicle.photos[0]?.url;
  // Link previews in WhatsApp and similar apps show the car's name and cover photo.
  return {
    title: name,
    robots,
    openGraph: {
      title: name,
      siteName: appConfig.name,
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
  };
}

/** Phone links need digits only; WhatsApp's wa.me also drops the leading "+". */
const digits = (phone: string) => phone.replace(/[^\d]/g, "");

export default async function SharedVehiclePage({ params }: Props) {
  const { token } = await params;
  const [t, tRoot, localeValue, result] = await Promise.all([
    getTranslations("share"),
    getTranslations(),
    getLocale(),
    getSharedVehicle(token),
  ]);
  const locale: AppLocale = isAppLocale(localeValue) ? localeValue : appConfig.defaultLocale;

  if (result.status === "ok") await recordShareView(result.linkId);

  return (
    <div className="bg-background h-svh overflow-y-auto">
      <header className="bg-background/90 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
        {result.status === "ok" ? (
          <VehicleView vehicle={result.vehicle} t={t} tRoot={tRoot} locale={locale} />
        ) : (
          <div className="mx-auto grid max-w-md justify-items-center gap-3 py-20 text-center">
            <span className="bg-muted flex size-14 items-center justify-center rounded-full">
              <CarFrontIcon className="text-muted-foreground size-7" aria-hidden />
            </span>
            <h1 className="font-heading text-xl font-semibold">{t("unavailableTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("unavailableBody")}</p>
          </div>
        )}
      </main>

      <footer className="text-muted-foreground mx-auto max-w-5xl px-4 pb-8 text-xs">
        © {new Date().getFullYear()} {appConfig.name}
      </footer>
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function VehicleView({
  vehicle: v,
  t,
  tRoot,
  locale,
}: {
  vehicle: SharedVehicle;
  t: Translator;
  tRoot: Translator;
  locale: AppLocale;
}) {
  const name = title(v);
  const label = (key: string, fallback: string | null) =>
    fallback == null ? null : tRoot.has(key) ? tRoot(key) : fallback;
  const bodyType = v.bodyType
    ? label(
        `inventory.enums.bodyType.${v.bodyType.trim().toLowerCase().replace(/\s+/g, "_")}`,
        v.bodyType,
      )
    : null;
  const mileage = `${formatNumber(v.mileage, locale)} ${tRoot(`inventory.enums.mileageUnit.${v.mileageUnit}`)}`;

  const highlights = [
    { icon: CalendarIcon, value: String(v.year) },
    { icon: GaugeIcon, value: mileage },
    {
      icon: CogIcon,
      value: label(`inventory.enums.transmission.${v.transmission}`, v.transmission),
    },
    { icon: FuelIcon, value: label(`inventory.enums.fuel.${v.fuelType}`, v.fuelType) },
  ].filter((item): item is { icon: typeof CalendarIcon; value: string } => !!item.value);

  const count = (value: number | null) => (value ? formatNumber(value, locale) : null);
  const date = (value: string | null) => (value ? formatDate(value, locale) : null);
  const country = findCountryByName(v.countryOfOrigin);
  const variant = locale === "ar" && v.variantAr ? v.variantAr : v.variant;

  // Everything about the car, grouped like a showroom spec sheet. Empty rows are hidden;
  // the overview always has content because every record has these fields.
  const sections: { title: string; rows: { label: string; value: string | null }[] }[] = [
    {
      title: t("sections.overview"),
      rows: [
        { label: tRoot("inventory.fields.make"), value: v.make },
        { label: tRoot("inventory.fields.model"), value: v.model },
        { label: tRoot("inventory.fields.variant"), value: variant },
        { label: tRoot("inventory.fields.year"), value: String(v.year) },
        { label: tRoot("inventory.fields.mileage"), value: mileage },
        {
          label: tRoot("inventory.fields.marketType"),
          value: tRoot(`inventory.enums.marketType.${v.marketType}`),
        },
        {
          label: tRoot("inventory.fields.condition"),
          value: v.condition ? label(`share.conditions.${v.condition}`, v.condition) : null,
        },
        { label: tRoot("inventory.fields.bodyType"), value: bodyType },
        {
          label: t("available"),
          value: v.quantity > 1 ? t("availableUnits", { count: v.quantity }) : null,
        },
      ],
    },
    {
      title: t("sections.engine"),
      rows: [
        { label: tRoot("inventory.fields.engineSize"), value: v.engineSize },
        { label: tRoot("inventory.fields.engineCylinders"), value: count(v.engineCylinders) },
        {
          label: tRoot("inventory.fields.transmission"),
          value: label(`inventory.enums.transmission.${v.transmission}`, v.transmission),
        },
        {
          label: tRoot("inventory.fields.fuelType"),
          value: label(`inventory.enums.fuel.${v.fuelType}`, v.fuelType),
        },
        {
          label: tRoot("inventory.fields.driveType"),
          value: label(`inventory.enums.drive.${v.driveType}`, v.driveType),
        },
      ],
    },
    {
      title: t("sections.design"),
      rows: [
        { label: tRoot("inventory.fields.exteriorColor"), value: v.exteriorColor },
        { label: tRoot("inventory.fields.interiorColor"), value: v.interiorColor },
        { label: tRoot("inventory.fields.seats"), value: count(v.seats) },
        { label: tRoot("inventory.fields.doors"), value: count(v.doors) },
      ],
    },
    {
      title: t("sections.history"),
      rows: [
        {
          label: tRoot("inventory.fields.origin"),
          value: label(`inventory.enums.origin.${v.originType}`, v.originType),
        },
        {
          label: tRoot("inventory.fields.countryOfOrigin"),
          value: v.countryOfOrigin
            ? `${country ? `${countryFlag(country.code)} ` : ""}${v.countryOfOrigin}`
            : null,
        },
        { label: tRoot("inventory.fields.registrationDate"), value: date(v.registrationDate) },
        { label: tRoot("inventory.fields.registrationExpiry"), value: date(v.registrationExpiry) },
      ],
    },
    {
      title: t("sections.identification"),
      rows: [
        { label: tRoot("inventory.fields.vin"), value: v.vin },
        { label: tRoot("inventory.fields.chassis"), value: v.chassisNumber },
        { label: t("reference"), value: v.stockNumber },
      ],
    },
  ]
    .map((section) => ({ ...section, rows: section.rows.filter((row) => row.value) }))
    .filter((section) => section.rows.length > 0);

  const emirate = v.branch?.emirate
    ? label(`modules.branches.emirates.${v.branch.emirate}`, v.branch.emirate)
    : null;
  const where = [v.branch?.location, v.branch?.address, v.branch?.city, emirate]
    .filter(Boolean)
    .join(" · ");

  // Booked and in-transit cars are still worth sending, but the customer should know.
  const notice =
    v.status === "reserved"
      ? t("statusReserved")
      : v.status === "acquired"
        ? v.portLocation
          ? t("statusArrivingAt", { port: v.portLocation })
          : t("statusArriving")
        : null;

  const contactPhone = v.contact?.phone ?? v.branch?.phone ?? null;
  const whatsappText = t("whatsappMessage", { title: name, reference: v.stockNumber });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-6">
        {v.photos.length > 0 ? (
          <section aria-label={t("photos")} className="grid gap-2">
            <div className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain rounded-xl [&::-webkit-scrollbar]:hidden">
              {v.photos.map((photo, index) => (
                <figure
                  key={photo.id}
                  id={`photo-${photo.id}`}
                  className="bg-muted relative aspect-[16/10] w-full shrink-0 snap-center overflow-hidden rounded-xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                  <img
                    src={photo.url}
                    alt={`${name} · ${label(`inventory.photos.categories.${photo.category}`, photo.category)}`}
                    className="size-full object-cover"
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                  />
                  <figcaption className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 text-xs font-medium text-white">
                    <span className="rounded-full bg-black/60 px-2.5 py-1">
                      {label(`inventory.photos.categories.${photo.category}`, photo.category)}
                    </span>
                    {v.photos.length > 1 ? (
                      <span className="rounded-full bg-black/60 px-2.5 py-1 tabular-nums">
                        {formatNumber(index + 1, locale)} / {formatNumber(v.photos.length, locale)}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
            {v.photos.length > 1 ? (
              <nav
                aria-label={t("allPhotos")}
                className="flex [scrollbar-width:thin] gap-2 overflow-x-auto pb-1"
              >
                {v.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={`#photo-${photo.id}`}
                    className="bg-muted hover:ring-brand block aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-md ring-1 ring-transparent transition-shadow sm:w-24"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img
                      src={photo.url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ))}
              </nav>
            ) : null}
          </section>
        ) : (
          <div className="bg-muted flex aspect-[16/10] items-center justify-center rounded-xl">
            <CarFrontIcon className="text-muted-foreground size-16" aria-hidden />
          </div>
        )}

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
              {tRoot(`inventory.enums.marketType.${v.marketType}`)}
            </span>
            {notice ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                {notice}
              </span>
            ) : null}
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {name}
          </h1>
          <ul className="flex flex-wrap gap-2">
            {highlights.map((item) => (
              <li
                key={item.value}
                className="bg-muted/60 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm tabular-nums"
              >
                <item.icon className="text-brand size-4" aria-hidden />
                {item.value}
              </li>
            ))}
          </ul>
        </section>

        {sections.map((section) => (
          <section key={section.title} className="grid gap-3">
            <h2 className="font-heading text-lg font-semibold">{section.title}</h2>
            <dl className="bg-card grid overflow-hidden rounded-xl border sm:grid-cols-2">
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b px-4 py-3 text-sm last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-end font-medium [overflow-wrap:anywhere]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="bg-card grid gap-5 rounded-xl border p-5 shadow-xs">
          <div className="grid gap-1">
            <p className="text-muted-foreground text-sm">{t("price")}</p>
            {v.sellingPrice != null ? (
              <p className="font-heading text-3xl font-semibold tabular-nums">
                {formatCurrency(v.sellingPrice, locale)}
                {v.quantity > 1 ? (
                  <span className="text-muted-foreground ms-1 text-sm font-normal">
                    {t("perUnit")}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="font-heading text-xl font-semibold">{t("priceOnRequest")}</p>
            )}
          </div>

          {contactPhone ? (
            <div className="grid gap-2">
              <a
                href={`https://wa.me/${digits(contactPhone)}?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 font-medium text-white hover:bg-[#1ebe5b]"
              >
                <MessageCircleIcon className="size-5" aria-hidden />
                {t("whatsapp")}
              </a>
              <a
                href={`tel:+${digits(contactPhone)}`}
                className="hover:bg-muted inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 font-medium"
              >
                <PhoneIcon className="size-5" aria-hidden />
                {t("call")}
              </a>
            </div>
          ) : null}

          {v.contact || v.branch ? (
            <div className="grid gap-3 border-t pt-4 text-sm">
              {v.contact ? (
                <div>
                  <p className="text-muted-foreground text-xs">{t("salesperson")}</p>
                  <p className="font-medium">{v.contact.name}</p>
                </div>
              ) : null}
              {v.branch ? (
                <div className="flex items-start gap-2">
                  <MapPinIcon
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <p className="grid gap-0.5">
                    <span className="font-medium">{v.branch.name}</span>
                    {where ? <span className="text-muted-foreground">{where}</span> : null}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
