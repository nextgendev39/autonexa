import Link from "next/link";
import { MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { VehicleCard } from "@/components/storefront/vehicle-card";
import type { AppLocale } from "@/config/app";
import { assetUrl, pick, visibleSections, type StorefrontConfig } from "@/lib/storefront/config";
import type { PublicVehicle } from "@/lib/storefront/public-vehicle";

export type HomeData = {
  name: string;
  locale: AppLocale;
  currency: string;
  config: StorefrontConfig;
  featured: PublicVehicle[];
  latest: PublicVehicle[];
  /** Addresses on the live site; on a preview, nothing that would leave the page. */
  href: (path: string) => string;
};

function digits(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

export async function ContactDetails({ config, locale }: { config: StorefrontConfig; locale: AppLocale }) {
  const t = await getTranslations("storefront");
  const { phone, whatsapp, email } = config.contact;
  const address = pick(config.contact.address, locale);
  const hours = pick(config.contact.hours, locale);
  if (!phone && !whatsapp && !email && !address && !hours) {
    return <p className="text-muted-foreground">{t("contact.none")}</p>;
  }
  return (
    <ul className="grid gap-3">
      {phone ? (
        <li>
          <a href={`tel:${phone}`} className="inline-flex items-center gap-2 hover:underline">
            <PhoneIcon className="size-4" aria-hidden />
            <span dir="ltr">{phone}</span>
          </a>
        </li>
      ) : null}
      {whatsapp ? (
        <li>
          <a href={`https://wa.me/${digits(whatsapp)}`} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-2 hover:underline">
            <MessageCircleIcon className="size-4" aria-hidden />
            {t("contact.whatsapp")}
          </a>
        </li>
      ) : null}
      {email ? (
        <li>
          <a href={`mailto:${email}`} className="inline-flex items-center gap-2 hover:underline">
            <MailIcon className="size-4" aria-hidden />
            {email}
          </a>
        </li>
      ) : null}
      {address ? (
        <li className="inline-flex items-start gap-2">
          <MapPinIcon className="mt-1 size-4 shrink-0" aria-hidden />
          <span className="whitespace-pre-line">{address}</span>
        </li>
      ) : null}
      {hours ? <li className="text-muted-foreground whitespace-pre-line">{hours}</li> : null}
    </ul>
  );
}

/** The home page for a live site and for a dealership's own preview. One codebase, many sites. */
export async function StorefrontHome({ name, locale, currency, config, featured, latest, href }: HomeData) {
  const t = await getTranslations("storefront");
  const banner = assetUrl(config.bannerPath);

  const grid = (vehicles: PublicVehicle[]) => (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.stockNumber}
          vehicle={vehicle}
          locale={locale}
          currency={currency}
          href={href(`/vehicles/${encodeURIComponent(vehicle.stockNumber)}`)}
        />
      ))}
    </div>
  );

  const sections = {
    hero: (
      <section
        key="hero"
        className="relative overflow-hidden rounded-2xl px-6 py-16 sm:px-12 sm:py-24"
        style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
      >
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element -- the dealership's own public image
          <img src={banner} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
        ) : null}
        <div className="relative max-w-2xl">
          <h1 className="font-heading text-3xl font-semibold text-balance sm:text-5xl">
            {pick(config.headline, locale) || name}
          </h1>
          {pick(config.tagline, locale) ? <p className="mt-4 text-lg text-pretty opacity-90">{pick(config.tagline, locale)}</p> : null}
          <Link
            href={href("/vehicles")}
            className="mt-8 inline-flex rounded-lg px-5 py-2.5 font-medium"
            style={{ background: "var(--sf-accent)", color: "var(--sf-on-accent)" }}
          >
            {t("home.browse")}
          </Link>
        </div>
      </section>
    ),
    featured:
      featured.length > 0 ? (
        <section key="featured" className="grid gap-5">
          <h2 className="font-heading text-2xl font-semibold">{t("home.featured")}</h2>
          {grid(featured)}
        </section>
      ) : null,
    inventory:
      latest.length > 0 ? (
        <section key="inventory" className="grid gap-5">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-heading text-2xl font-semibold">{t("home.latest")}</h2>
            <Link href={href("/vehicles")} className="text-sm font-medium hover:underline">
              {t("home.viewAll")}
            </Link>
          </div>
          {grid(latest)}
        </section>
      ) : null,
    about: pick(config.about, locale) ? (
      <section key="about" className="grid max-w-3xl gap-3">
        <h2 className="font-heading text-2xl font-semibold">{t("home.about", { name })}</h2>
        <p className="whitespace-pre-line text-pretty">{pick(config.about, locale)}</p>
      </section>
    ) : null,
    contact: (
      <section key="contact" className="grid max-w-3xl gap-3">
        <h2 className="font-heading text-2xl font-semibold">{t("contact.title")}</h2>
        <ContactDetails config={config} locale={locale} />
      </section>
    ),
  };

  return <div className="flex flex-col gap-12">{visibleSections(config).map((key) => sections[key])}</div>;
}
