import Link from "next/link";
import { Suspense } from "react";
import { ClockIcon, MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { brandLogo, telLink, valueLabel, whatsappLink } from "@/components/storefront/labels";
import { SiteHeader, type MenuData, type SiteLinks } from "@/components/storefront/site-header";
import type { ListingFacets } from "@/lib/storefront/vehicles";
import {
  assetUrl,
  pick,
  readableOn,
  SOCIAL_KEYS,
  type StorefrontConfig,
} from "@/lib/storefront/config";

/** Colours go through the config's parser first, which only ever lets a hex value through. */
export const brandStyle = (config: StorefrontConfig) =>
  ({
    "--sf-primary": config.primaryColor,
    "--sf-on-primary": readableOn(config.primaryColor),
    "--sf-accent": config.accentColor,
    "--sf-on-accent": readableOn(config.accentColor),
  }) as React.CSSProperties;

export function siteLinks(href: (path: string) => string, switchHref: string): SiteLinks {
  return {
    home: href("/"),
    vehicles: href("/vehicles"),
    used: href("/vehicles?condition=used"),
    new: href("/vehicles?condition=new"),
    saved: href("/saved"),
    contact: href("/contact"),
    switchLanguage: switchHref,
  };
}

export async function SiteShell({
  name,
  config,
  href,
  switchHref,
  facets = null,
  api = "/api/storefront",
  children,
}: {
  name: string;
  config: StorefrontConfig;
  href: (path: string) => string;
  /** The same page in the other language. */
  switchHref: string;
  /** What's listed, for the Cars menu. Without it the menu is a plain link. */
  facets?: ListingFacets | null;
  /** Where the header's search asks for suggestions. */
  api?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("storefront");
  const locale = await getLocale();
  const logo = assetUrl(config.logoPath);
  const links = siteLinks(href, switchHref);
  const { phone, whatsapp, email, mapUrl } = config.contact;
  const address = pick(config.contact.address, locale);
  const hours = pick(config.contact.hours, locale);
  const social = SOCIAL_KEYS.flatMap((key) => {
    const url = config.social[key];
    return url ? [{ key, url }] : [];
  });
  const year = new Date().getFullYear();
  const byCount = <T extends { count: number }>(list: T[]) =>
    [...list].sort((a, b) => b.count - a.count);
  const menu: MenuData | null =
    facets && facets.total > 0
      ? {
          total: facets.total,
          used: facets.conditions.find((item) => item.value === "used")?.count ?? 0,
          new: facets.conditions.find((item) => item.value === "new")?.count ?? 0,
          bodies: byCount(facets.bodies)
            .slice(0, 6)
            .map((body) => ({
              label: valueLabel(t, "body", body.value) ?? body.value,
              count: body.count,
              href: href(`/vehicles?body=${encodeURIComponent(body.value)}`),
            })),
          brands: byCount(facets.makes)
            .slice(0, 8)
            .map((make) => ({
              label: make.value,
              count: make.count,
              href: href(`/vehicles?make=${encodeURIComponent(make.value)}`),
              logo: brandLogo(make.value),
            })),
        }
      : null;

  return (
    <div
      data-storefront
      className="bg-background text-foreground flex min-h-svh flex-col"
      style={brandStyle(config)}
    >
      {/* The staff app locks html and body so its own panes scroll. A website scrolls the page
          itself, so it lifts the lock while it's on screen; the rule leaves with this element. */}
      <style>{"html,body{height:auto;min-height:100%;overflow:visible;overflow-x:clip}"}</style>
      <a
        href="#main"
        className="bg-background sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t("nav.label")}
      </a>
      {/* The header reads the address's query (used or new), which needs a Suspense boundary. */}
      <Suspense fallback={<div className="h-16" />}>
        <SiteHeader
          name={name}
          logo={logo}
          links={links}
          phone={phone || null}
          whatsapp={whatsapp || phone || null}
          menu={menu}
          api={api}
        />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer
        className="text-[color:var(--sf-on-primary)]"
        style={{ background: "var(--sf-primary)" }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1.4fr]">
          <div className="grid content-start gap-4">
            <Link href={links.home} className="flex items-center gap-2.5">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- the dealership's own public image
                <img
                  src={logo}
                  alt=""
                  className="h-10 w-auto max-w-40 rounded bg-white/95 object-contain p-1"
                />
              ) : null}
              <span className="font-heading text-xl font-semibold">{name}</span>
            </Link>
            {pick(config.tagline, locale) ? (
              <p className="max-w-sm text-sm text-pretty opacity-75">
                {pick(config.tagline, locale)}
              </p>
            ) : null}
            {social.length ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-60">
                  {t("contact.follow")}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {social.map(({ key, url }) => (
                    <li key={key}>
                      <a
                        href={url}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="inline-flex h-8 items-center rounded-full border border-current/25 px-3 text-xs font-medium opacity-85 transition hover:opacity-100"
                      >
                        {t(`social.${key}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <nav aria-label={t("contact.quickLinks")} className="grid content-start gap-2.5 text-sm">
            <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-60">
              {t("contact.quickLinks")}
            </p>
            {[
              [links.vehicles, t("nav.vehicles")],
              [links.used, t("nav.used")],
              [links.new, t("nav.new")],
              [links.saved, t("nav.saved")],
              [links.contact, t("nav.contact")],
            ].map(([url, label]) => (
              <Link key={label} href={url} className="opacity-80 transition hover:opacity-100">
                {label}
              </Link>
            ))}
          </nav>

          <div className="grid content-start gap-2.5 text-sm">
            <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-60">
              {t("contact.title")}
            </p>
            {phone ? (
              <a
                href={telLink(phone)}
                className="inline-flex items-center gap-2 opacity-80 hover:opacity-100"
              >
                <PhoneIcon className="size-4 shrink-0" aria-hidden />
                <span dir="ltr">{phone}</span>
              </a>
            ) : null}
            {whatsapp ? (
              <a
                href={whatsappLink(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 opacity-80 hover:opacity-100"
              >
                <MessageCircleIcon className="size-4 shrink-0" aria-hidden />
                {t("contact.whatsapp")}
              </a>
            ) : null}
            {email ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-2 break-all opacity-80 hover:opacity-100"
              >
                <MailIcon className="size-4 shrink-0" aria-hidden />
                {email}
              </a>
            ) : null}
          </div>

          <div className="grid content-start gap-3 text-sm">
            {address ? (
              <div className="grid gap-1.5">
                <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-60">
                  {t("contact.address")}
                </p>
                <p className="flex items-start gap-2 whitespace-pre-line opacity-80">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {address}
                </p>
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ms-6 w-fit text-xs font-semibold underline underline-offset-4 opacity-90"
                  >
                    {t("contact.map")}
                  </a>
                ) : null}
              </div>
            ) : null}
            {hours ? (
              <div className="grid gap-1.5">
                <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-60">
                  {t("contact.hours")}
                </p>
                <p className="flex items-start gap-2 whitespace-pre-line opacity-80">
                  <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {hours}
                </p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="border-t border-current/15">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap justify-between gap-2 px-4 py-5 text-xs opacity-65 sm:px-6">
            <p>
              © {year} {name}. {t("footer.rights")}
            </p>
            <p>{t("footer.poweredBy")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
