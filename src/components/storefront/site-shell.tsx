import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { assetUrl, readableOn, SOCIAL_KEYS, type StorefrontConfig } from "@/lib/storefront/config";

/** Colours go through the config's parser first, which only ever lets a hex value through. */
export const brandStyle = (config: StorefrontConfig) =>
  ({
    "--sf-primary": config.primaryColor,
    "--sf-on-primary": readableOn(config.primaryColor),
    "--sf-accent": config.accentColor,
    "--sf-on-accent": readableOn(config.accentColor),
  }) as React.CSSProperties;

export async function SiteShell({
  name,
  config,
  href,
  switchHref,
  children,
}: {
  name: string;
  config: StorefrontConfig;
  href: (path: string) => string;
  /** The same page in the other language. */
  switchHref: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("storefront");
  const logo = assetUrl(config.logoPath);
  const social = SOCIAL_KEYS.flatMap((key) => {
    const url = config.social[key];
    return url ? [{ key, url }] : [];
  });
  return (
    <div data-storefront className="bg-background text-foreground flex min-h-svh flex-col" style={brandStyle(config)}>
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={href("/")} className="flex items-center gap-2 font-semibold">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the dealership's own public image
              <img src={logo} alt="" className="h-9 w-auto max-w-40 object-contain" />
            ) : null}
            <span>{name}</span>
          </Link>
          <nav aria-label={t("nav.label")} className="ms-auto flex items-center gap-4 text-sm font-medium">
            <Link href={href("/vehicles")} className="hover:underline">{t("nav.vehicles")}</Link>
            <Link href={href("/contact")} className="hover:underline">{t("nav.contact")}</Link>
            <Link href={switchHref} className="hover:underline">{t("nav.switchLanguage")}</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm">
          <span>© {name}</span>
          {social.map(({ key, url }) => (
            <a key={key} href={url} rel="noopener noreferrer" target="_blank" className="hover:underline">
              {t(`social.${key}`)}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
