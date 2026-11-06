import Link from "next/link";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BusIcon,
  CarFrontIcon,
  CarIcon,
  CarTaxiFrontIcon,
  CircleEllipsisIcon,
  GaugeIcon,
  SunIcon,
  TruckIcon,
  ClockIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  ZapIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RecentlyViewed } from "@/components/storefront/device-vehicles";
import { HeroSearch } from "@/components/storefront/hero-search";
import {
  brandLogo,
  telLink,
  valueKey,
  valueLabel,
  whatsappLink,
} from "@/components/storefront/labels";
import { Reveal, RevealGroup, RevealItem } from "@/components/storefront/reveal";
import { VehicleCard } from "@/components/storefront/vehicle-card";
import type { AppLocale } from "@/config/app";
import { assetUrl, pick, visibleSections, type StorefrontConfig } from "@/lib/storefront/config";
import type { PublicVehicle } from "@/lib/storefront/public-vehicle";
import type { ListingFacets } from "@/lib/storefront/vehicles";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";

export type HomeData = {
  name: string;
  locale: AppLocale;
  currency: string;
  config: StorefrontConfig;
  featured: PublicVehicle[];
  latest: PublicVehicle[];
  newCars: PublicVehicle[];
  usedCars: PublicVehicle[];
  facets: ListingFacets;
  /** Addresses on the live site; on a preview, nothing that would leave the page. */
  href: (path: string) => string;
  /** Where the browser calls for suggestions and saved cars. */
  api?: string;
};

const container = "mx-auto w-full max-w-7xl px-4 sm:px-6";

/** Same shapes as the inventory screens use, kept here so this page stays a server component. */
const BODY_ICONS: Record<string, typeof CarIcon> = {
  sedan: CarIcon,
  suv: CarFrontIcon,
  crossover: CarTaxiFrontIcon,
  hatchback: CarIcon,
  coupe: GaugeIcon,
  convertible: SunIcon,
  pickup: TruckIcon,
  van: BusIcon,
  wagon: CarTaxiFrontIcon,
  sports_car: GaugeIcon,
  other: CircleEllipsisIcon,
};
const BodyIcon = ({ body }: { body: string }) => {
  const Icon = BODY_ICONS[valueKey(body)] ?? CarIcon;
  return <Icon aria-hidden />;
};

export async function ContactDetails({
  config,
  locale,
  layout = "list",
}: {
  config: StorefrontConfig;
  locale: AppLocale;
  /** "grid": call, WhatsApp and email side by side; showroom and hours full width. */
  layout?: "list" | "grid";
}) {
  const t = await getTranslations("storefront");
  const { phone, whatsapp, email, mapUrl } = config.contact;
  const address = pick(config.contact.address, locale);
  const hours = pick(config.contact.hours, locale);
  if (!phone && !whatsapp && !email && !address && !hours) {
    return <p className="text-muted-foreground">{t("contact.none")}</p>;
  }
  const row = "bg-card ring-border flex h-full items-start gap-4 rounded-lg p-4 ring-1";
  // Solid tiles with a colour chosen for readability on that tile, so icons show in light and dark
  // mode whatever the dealership's colours. The thin inner ring keeps a dark tile visible on a dark card.
  const icon =
    "flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/15 [&_svg]:size-5";
  const tiles = {
    call: { background: "var(--sf-primary)", color: "var(--sf-on-primary)" },
    whatsapp: { background: "#1f9d55", color: "#ffffff" },
    email: { background: "var(--sf-accent)", color: "var(--sf-on-accent)" },
    place: {
      background: "color-mix(in oklch, var(--sf-accent) 22%, var(--card))",
      color: "color-mix(in oklch, var(--sf-accent) 70%, var(--foreground))",
    },
  } satisfies Record<string, React.CSSProperties>;
  const channels = [phone, whatsapp, email].filter(Boolean).length;
  // An odd one out among call / WhatsApp / email takes the whole row, so the grid has no hole.
  const wide = layout === "grid" ? "sm:col-span-2" : "";
  const lastChannel = email ? "email" : whatsapp ? "whatsapp" : "phone";
  const spanFor = (channel: "phone" | "whatsapp" | "email") =>
    layout === "grid" && channels % 2 === 1 && channel === lastChannel
      ? "sm:col-span-2"
      : undefined;
  return (
    <ul className={layout === "grid" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
      {phone ? (
        <li className={spanFor("phone")}>
          <a href={telLink(phone)} className={`${row} hover:bg-muted/60 transition-colors`}>
            <span className={icon} style={tiles.call}>
              <PhoneIcon aria-hidden />
            </span>
            <span className="grid">
              <span className="text-muted-foreground text-xs font-semibold uppercase">
                {t("contact.call")}
              </span>
              <span className="font-medium" dir="ltr">
                {phone}
              </span>
            </span>
          </a>
        </li>
      ) : null}
      {whatsapp ? (
        <li className={spanFor("whatsapp")}>
          <a
            href={whatsappLink(whatsapp)}
            rel="noopener noreferrer"
            target="_blank"
            className={`${row} hover:bg-muted/60 transition-colors`}
          >
            <span className={icon} style={tiles.whatsapp}>
              <MessageCircleIcon aria-hidden />
            </span>
            <span className="grid">
              <span className="text-muted-foreground text-xs font-semibold uppercase">
                {t("vehicle.whatsapp")}
              </span>
              <span className="font-medium">{t("contact.whatsapp")}</span>
            </span>
          </a>
        </li>
      ) : null}
      {email ? (
        <li className={spanFor("email")}>
          <a href={`mailto:${email}`} className={`${row} hover:bg-muted/60 transition-colors`}>
            <span className={icon} style={tiles.email}>
              <MailIcon aria-hidden />
            </span>
            <span className="grid min-w-0">
              <span className="text-muted-foreground text-xs font-semibold uppercase">
                {t("contact.email")}
              </span>
              <span className="truncate font-medium">{email}</span>
            </span>
          </a>
        </li>
      ) : null}
      {address ? (
        <li className={cn(row, wide)}>
          <span className={icon} style={tiles.place}>
            <MapPinIcon aria-hidden />
          </span>
          <span className="grid gap-1">
            <span className="text-muted-foreground text-xs font-semibold uppercase">
              {t("contact.address")}
            </span>
            <span className="whitespace-pre-line">{address}</span>
            {mapUrl ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-sm font-semibold underline underline-offset-4"
              >
                {t("contact.map")}
              </a>
            ) : null}
          </span>
        </li>
      ) : null}
      {hours ? (
        <li className={cn(row, wide)}>
          <span className={icon} style={tiles.place}>
            <ClockIcon aria-hidden />
          </span>
          <span className="grid gap-1">
            <span className="text-muted-foreground text-xs font-semibold uppercase">
              {t("contact.hours")}
            </span>
            <span className="whitespace-pre-line">{hours}</span>
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function SectionTitle({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold hover:underline"
        >
          {linkLabel}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

/** The home page for a live site and for a dealership's own preview. One codebase, many sites. */
export async function StorefrontHome({
  name,
  locale,
  currency,
  config,
  featured,
  latest,
  newCars,
  usedCars,
  facets,
  href,
  api = "/api/storefront",
}: HomeData) {
  const t = await getTranslations("storefront");
  const banner = assetUrl(config.bannerPath);
  const listing = href("/vehicles");
  const vehicleHref = (vehicle: PublicVehicle) =>
    href(`/vehicles/${encodeURIComponent(vehicle.stockNumber)}`);
  const filterHref = (params: Record<string, string>) =>
    href(`/vehicles?${new URLSearchParams(params).toString()}`);

  const grid = (vehicles: PublicVehicle[]) => (
    <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {vehicles.map((vehicle) => (
        <RevealItem key={vehicle.stockNumber}>
          <VehicleCard
            vehicle={vehicle}
            locale={locale}
            currency={currency}
            href={vehicleHref(vehicle)}
            className="h-full"
          />
        </RevealItem>
      ))}
    </RevealGroup>
  );

  const countOf = (value: string) =>
    facets.conditions.find((item) => item.value === value)?.count ?? 0;
  const highlights = [
    { value: facets.total, label: t("home.highlightCars") },
    { value: facets.makes.length, label: t("home.highlightBrands") },
    { value: countOf("used"), label: t("home.highlightUsed") },
    { value: countOf("new"), label: t("home.highlightNew") },
  ].filter((item) => item.value > 0);

  const promos = config.promos.filter((promo) => pick(promo.title, locale));

  const sections = {
    hero: (
      <div key="hero">
        <section
          className="relative isolate overflow-hidden"
          style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
        >
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element -- the dealership's own public image
            <img src={banner} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          ) : null}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: banner
                ? "linear-gradient(180deg, color-mix(in oklch, var(--sf-primary) 55%, transparent) 0%, color-mix(in oklch, var(--sf-primary) 92%, transparent) 100%)"
                : "radial-gradient(ellipse at 70% 0%, color-mix(in oklch, var(--sf-accent) 35%, transparent), transparent 60%)",
            }}
            aria-hidden
          />
          <div className={`${container} grid gap-8 pt-14 pb-10 sm:pt-20 lg:pt-24`}>
            <Reveal className="max-w-3xl">
              <h1 className="font-heading text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                {pick(config.headline, locale) || name}
              </h1>
              {pick(config.tagline, locale) ? (
                <p className="mt-4 max-w-2xl text-lg text-pretty opacity-85">
                  {pick(config.tagline, locale)}
                </p>
              ) : null}
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="sr-only">{t("home.searchTitle")}</h2>
              <HeroSearch
                facets={facets}
                action={listing}
                vehicleBase={listing}
                locale={locale}
                currency={currency}
                api={api}
              />
            </Reveal>
            {highlights.length ? (
              <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {highlights.map((item) => (
                  <RevealItem
                    key={item.label}
                    className="rounded-lg border border-current/15 bg-current/5 px-4 py-3"
                  >
                    <p className="font-heading text-2xl font-semibold sm:text-3xl">
                      {formatNumber(item.value, locale)}
                    </p>
                    <p className="text-sm opacity-75">{item.label}</p>
                  </RevealItem>
                ))}
              </RevealGroup>
            ) : null}
          </div>
        </section>

        {promos.length ? (
          <section className={`${container} pt-10`}>
            <RevealGroup
              className={`grid gap-4 ${promos.length > 1 ? "md:grid-cols-2" : ""} ${promos.length > 2 ? "lg:grid-cols-3" : ""}`}
            >
              {promos.map((promo, index) => {
                const body = (
                  <div
                    className="relative h-full overflow-hidden rounded-lg p-6 transition-transform duration-300 hover:-translate-y-0.5"
                    style={
                      index % 2 === 0
                        ? { background: "var(--sf-accent)", color: "var(--sf-on-accent)" }
                        : { background: "var(--sf-primary)", color: "var(--sf-on-primary)" }
                    }
                  >
                    <div
                      className="absolute -end-10 -top-10 size-40 rounded-full bg-current opacity-10"
                      aria-hidden
                    />
                    <p className="font-heading text-xl font-semibold text-balance">
                      {pick(promo.title, locale)}
                    </p>
                    {pick(promo.text, locale) ? (
                      <p className="mt-2 text-sm text-pretty opacity-85">
                        {pick(promo.text, locale)}
                      </p>
                    ) : null}
                    {promo.href ? (
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                        {t("home.browse")}
                        <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
                      </span>
                    ) : null}
                  </div>
                );
                return (
                  <RevealItem key={index}>
                    {promo.href ? (
                      <Link href={href(promo.href)} className="block h-full">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </RevealItem>
                );
              })}
            </RevealGroup>
          </section>
        ) : null}
      </div>
    ),
    featured:
      featured.length > 0 ? (
        <section key="featured" className={`${container} grid gap-6`}>
          <SectionTitle title={t("home.featured")} href={listing} linkLabel={t("home.viewAll")} />
          {grid(featured.slice(0, 8))}
        </section>
      ) : null,
    inventory: (
      <div key="inventory" className="grid gap-16">
        {facets.makes.length > 1 ? (
          <section className={`${container} grid gap-6`}>
            <SectionTitle title={t("home.brands")} href={listing} linkLabel={t("home.viewAll")} />
            <RevealGroup className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {facets.makes
                .slice()
                .sort((a, b) => b.count - a.count)
                .slice(0, 12)
                .map((make) => {
                  const logo = brandLogo(make.value);
                  return (
                    <RevealItem key={make.value}>
                      <Link
                        href={filterHref({ make: make.value })}
                        className="bg-card ring-border hover:ring-foreground/30 flex h-full flex-col items-center gap-2 rounded-lg px-3 py-4 text-center ring-1 transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a small static logo
                          <img
                            src={logo}
                            alt=""
                            className="h-10 w-auto max-w-16 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="bg-muted font-heading flex size-10 items-center justify-center rounded-full text-sm font-semibold">
                            {make.value.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="line-clamp-1 text-sm font-semibold">{make.value}</span>
                        <span className="text-muted-foreground text-xs">
                          {t("home.carsCount", { count: make.count })}
                        </span>
                      </Link>
                    </RevealItem>
                  );
                })}
            </RevealGroup>
          </section>
        ) : null}

        {facets.bodies.length > 1 ? (
          <section className={`${container} grid gap-6`}>
            <SectionTitle title={t("home.bodies")} />
            <RevealGroup className="flex flex-wrap gap-3">
              {facets.bodies.map((body) => (
                <RevealItem key={body.value}>
                  <Link
                    href={filterHref({ body: body.value })}
                    className="bg-card ring-border hover:ring-foreground/30 inline-flex items-center gap-3 rounded-full py-2 ps-2 pe-4 ring-1 transition hover:shadow-md [&_svg]:size-4.5"
                  >
                    <span className="bg-muted flex size-9 items-center justify-center rounded-full">
                      <BodyIcon body={body.value} />
                    </span>
                    <span className="text-sm font-semibold">
                      {valueLabel(t, "body", body.value)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatNumber(body.count, locale)}
                    </span>
                  </Link>
                </RevealItem>
              ))}
            </RevealGroup>
          </section>
        ) : null}

        {latest.length > 0 ? (
          <section className={`${container} grid gap-6`}>
            <SectionTitle title={t("home.latest")} href={listing} linkLabel={t("home.viewAll")} />
            {grid(latest.slice(0, 8))}
          </section>
        ) : null}

        {usedCars.length > 0 && newCars.length > 0 ? (
          <>
            <section className={`${container} grid gap-6`}>
              <SectionTitle
                title={t("home.usedCars")}
                href={filterHref({ condition: "used" })}
                linkLabel={t("home.viewAll")}
              />
              {grid(usedCars.slice(0, 4))}
            </section>
            <section className={`${container} grid gap-6`}>
              <SectionTitle
                title={t("home.newCars")}
                href={filterHref({ condition: "new" })}
                linkLabel={t("home.viewAll")}
              />
              {grid(newCars.slice(0, 4))}
            </section>
          </>
        ) : null}

        <div className={container}>
          <RecentlyViewed
            title={t("home.recent")}
            locale={locale}
            currency={currency}
            vehicleBase={listing}
            api={api}
          />
        </div>
      </div>
    ),
    about: (
      <section key="about" className="bg-muted/50 border-border border-y py-16">
        <div className={`${container} grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16`}>
          <Reveal className="grid content-start gap-4">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {pick(config.about, locale) ? t("home.about", { name }) : t("home.why")}
            </h2>
            {pick(config.about, locale) ? (
              <p className="text-muted-foreground text-pretty whitespace-pre-line">
                {pick(config.about, locale)}
              </p>
            ) : null}
          </Reveal>
          <RevealGroup className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              {
                icon: ShieldCheckIcon,
                title: t("home.whyInspected"),
                text: t("home.whyInspectedText"),
              },
              { icon: ReceiptTextIcon, title: t("home.whyPrice"), text: t("home.whyPriceText") },
              { icon: ZapIcon, title: t("home.whyContact"), text: t("home.whyContactText") },
            ].map(({ icon: Icon, title, text }) => (
              <RevealItem key={title} className="bg-card ring-border rounded-lg p-5 ring-1">
                <span
                  className="flex size-10 items-center justify-center rounded-lg"
                  style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">{text}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>
    ),
    contact: (
      <section key="contact" className={`${container} grid gap-8 lg:grid-cols-[1fr_1.2fr]`}>
        <Reveal className="grid content-start gap-3">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("contact.visit")}
          </h2>
          <p className="text-muted-foreground inline-flex items-center gap-2">
            <BadgeCheckIcon className="size-4" aria-hidden />
            {name}
          </p>
          <Link
            href={href("/contact")}
            className="mt-2 inline-flex h-11 w-fit items-center gap-2 rounded-lg px-5 text-sm font-semibold"
            style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
          >
            {t("contact.title")}
            <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <ContactDetails config={config} locale={locale} />
        </Reveal>
      </section>
    ),
  };

  return (
    <div className="flex flex-col gap-16 pb-20">
      {visibleSections(config).map((key) => sections[key])}
    </div>
  );
}
