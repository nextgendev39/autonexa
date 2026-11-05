/**
 * Which site a request is for, decided from the Host header alone. Pure, so the proxy can run it
 * and tests can attack it. Forwarded headers are ignored: a client can set those to anything.
 */
export type HostSettings = {
  /** Dealerships live at <slug>.<baseDomain>. Without one, storefront routing is off entirely. */
  baseDomain: string | null;
  /** Hosts that serve the staff app. A leading "*." matches any subdomain. */
  appHosts: string[];
};

const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

export function normalizeHost(raw: string | null | undefined) {
  if (!raw) return null;
  // A port isn't part of the name, and neither is the root dot in "example.com.".
  const host = raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return VALID_HOST.test(host) && host.length <= 253 ? host : null;
}

export function hostSettingsFromEnv(env: Record<string, string | undefined> = process.env): HostSettings {
  const appHosts = ["localhost", "127.0.0.1"];
  try {
    if (env.NEXT_PUBLIC_SITE_URL) appHosts.push(new URL(env.NEXT_PUBLIC_SITE_URL).hostname.toLowerCase());
  } catch {
    /* An invalid URL simply adds nothing. */
  }
  for (const host of (env.APP_HOSTS ?? "").split(",")) {
    if (host.trim()) appHosts.push(host.trim().toLowerCase());
  }
  return { baseDomain: normalizeHost(env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN), appHosts };
}

const matches = (host: string, pattern: string) =>
  pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : host === pattern;

export function isStorefrontHost(rawHost: string | null | undefined, settings: HostSettings) {
  if (!settings.baseDomain) return false;
  const host = normalizeHost(rawHost);
  // A missing or malformed host is treated as the app, whose own checks then apply.
  if (!host) return false;
  if (settings.appHosts.some((pattern) => matches(host, pattern))) return false;
  if (host === settings.baseDomain || host === `www.${settings.baseDomain}`) return false;
  return true;
}

/** A domain a dealership may not claim: ours, or anything under ours. */
export function isReservedDomain(domain: string, settings: HostSettings) {
  const host = normalizeHost(domain);
  if (!host) return true;
  if (settings.appHosts.some((pattern) => matches(host, pattern))) return true;
  return Boolean(settings.baseDomain) && (host === settings.baseDomain || host.endsWith(`.${settings.baseDomain}`));
}

export const SITE_LOCALES = ["en", "ar"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

export type SiteRoute =
  | { kind: "page"; locale: SiteLocale; explicitLocale: boolean; path: string }
  | { kind: "api"; path: string }
  | { kind: "not_found" };

/**
 * Where a request on a dealership's host may go. The staff app and its API are unreachable here,
 * so a dealership's domain can't be made to show a sign-in form or set a session.
 */
export function routeStorefrontPath(pathname: string): SiteRoute {
  if (pathname === "/robots.txt") return { kind: "api", path: "/api/storefront/robots" };
  if (pathname === "/sitemap.xml") return { kind: "api", path: "/api/storefront/sitemap" };
  if (pathname === "/api/storefront" || pathname.startsWith("/api/storefront/")) {
    return { kind: "api", path: pathname };
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) return { kind: "not_found" };

  const [, first, ...rest] = pathname.split("/");
  const explicitLocale = (SITE_LOCALES as readonly string[]).includes(first);
  const locale: SiteLocale = explicitLocale ? (first as SiteLocale) : "en";
  const path = explicitLocale ? `/${rest.join("/")}` : pathname;
  // Only the website's own pages. Everything else that exists in the app stays out of reach.
  const allowed = /^\/$|^\/vehicles\/?$|^\/vehicles\/[^/]+\/?$|^\/contact\/?$/;
  if (!allowed.test(path)) return { kind: "not_found" };
  return { kind: "page", locale, explicitLocale, path };
}

/** The app's internal address for a website page, which the staff app's host can't reach. */
export const internalSitePath = (locale: SiteLocale, path: string) =>
  `/${locale}/site${path === "/" ? "" : path}`;

/** Website pages are internal: on the staff app's host they don't exist. */
export const isInternalSitePath = (pathname: string) => /^\/(?:(?:en|ar)\/)?site(?:\/|$)/.test(pathname);

/** The public address of a website page. */
export function sitePath(locale: string, path: string, defaultLocale = "en") {
  const clean = path === "/" ? "" : path;
  if (locale === "en" && defaultLocale !== "ar") return clean || "/";
  return `/${locale}${clean}`;
}
