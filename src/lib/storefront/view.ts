import "server-only";

import { getLocale } from "next-intl/server";
import { cache } from "react";

import type { AppLocale } from "@/config/app";
import { requirePagePermission } from "@/lib/auth/authorize";
import { tenantClient, type TenantClient } from "@/lib/server/privileged";
import type { StorefrontConfig } from "@/lib/storefront/config";
import { sitePath } from "@/lib/storefront/host";
import { getStorefront } from "@/lib/storefront/manage";
import { requireSite, siteClient, trackEvent, type Site } from "@/lib/storefront/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything a website page needs, whichever way it's being looked at:
 * - "live": a visitor on the dealership's own address. The dealership comes from the host.
 * - "preview": a dealership admin inside the staff app, looking at their saved draft. The
 *   dealership comes from their session, and nothing they do is recorded as a visitor's.
 * Both read cars through the same listed-cars filter, so the preview shows exactly what's public.
 */
export type SiteView = {
  mode: "live" | "preview";
  tenantId: string;
  client: TenantClient;
  name: string;
  config: StorefrontConfig;
  currency: string;
  locale: AppLocale;
  bookingEnabled: boolean;
  /** Address of a page on this site, e.g. href("/vehicles?make=Kia"). */
  href: (path: string) => string;
  /** The same page in the other language. */
  switchHref: (path: string) => string;
  /** Where the browser calls for suggestions, saved cars and enquiries. */
  api: string;
  /** Counts visits. A no-op in preview. */
  track: (
    kind: "page_view" | "vehicle_view",
    details: { path: string; vehicleId?: string | null },
  ) => Promise<void>;
};

export const PREVIEW_BASE = "/storefront-preview";
export const PREVIEW_API = "/api/dealership-storefront/preview";

export function liveView(site: Site, locale: AppLocale): SiteView {
  return {
    mode: "live",
    tenantId: site.tenantId,
    client: siteClient(site),
    name: site.displayName,
    config: site.config,
    currency: site.currency,
    locale,
    bookingEnabled: site.bookingEnabled,
    href: (path) => sitePath(locale, path, site.defaultLocale),
    switchHref: (path) => sitePath(locale === "ar" ? "en" : "ar", path, site.defaultLocale),
    api: "/api/storefront",
    track: (kind, details) => trackEvent(site, kind, details),
  };
}

export const getLiveView = async () =>
  liveView(await requireSite(), (await getLocale()) as AppLocale);

/** The staff app keeps the language in a cookie, so a prefixed address just switches it. */
const previewHref = (path: string) => `${PREVIEW_BASE}${path === "/" ? "" : path}`;

export const getPreviewView = cache(async (): Promise<SiteView> => {
  const context = await requirePagePermission("storefront.manage");
  const locale = (await getLocale()) as AppLocale;
  const { draft } = await getStorefront(context);
  const supabase = await createClient();
  const [tenant, settings] = await Promise.all([
    supabase
      .from("tenants" as never)
      .select("name")
      .maybeSingle(),
    supabase
      .from("tenant_settings" as never)
      .select("display_name, currency")
      .maybeSingle(),
  ]);
  const row = settings.data as unknown as {
    display_name: string | null;
    currency: string | null;
  } | null;
  const off = context.disabledFeatures;
  return {
    mode: "preview",
    tenantId: context.tenantId ?? "",
    client: tenantClient(context),
    name: row?.display_name ?? (tenant.data as unknown as { name: string } | null)?.name ?? "",
    config: draft,
    currency: row?.currency ?? "AED",
    locale,
    bookingEnabled: !off.includes("storefront_booking") && !off.includes("bookings"),
    href: previewHref,
    switchHref: (path) => `/${locale === "ar" ? "en" : "ar"}${previewHref(path)}`,
    api: PREVIEW_API,
    track: async () => {},
  };
});
