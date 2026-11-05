import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { tenantClient } from "@/lib/server/privileged";
import { hitRateLimit, resolveStorefrontHost, type ResolvedSite } from "@/lib/server/privileged/storefront";
import { clientAddress } from "@/lib/storefront/address";
import { parseStorefrontConfig, type StorefrontConfig } from "@/lib/storefront/config";

export type Site = Omit<ResolvedSite, "config"> & { config: StorefrontConfig };

function toSite(resolved: ResolvedSite): Site {
  return { ...resolved, config: parseStorefrontConfig(resolved.config, resolved.tenantId) };
}

/** The dealership for this request, from its Host header and verified mappings. Nothing else. */
export const getSite = cache(async (): Promise<Site | null> => {
  const store = await headers();
  const resolved = await resolveStorefrontHost(store.get("host"));
  return resolved ? toSite(resolved) : null;
});

export async function requireSite() {
  const site = await getSite();
  if (!site) notFound();
  return site;
}

/** For API routes, which get the Host from their own request. */
export async function siteFromRequest(request: Request) {
  const resolved = await resolveStorefrontHost(request.headers.get("host"));
  return resolved ? toSite(resolved) : null;
}

export const siteClient = (site: Pick<Site, "tenantId">) => tenantClient({ tenantId: site.tenantId });

const secret = () =>
  process.env.STOREFRONT_ANALYTICS_SALT?.trim() || process.env.EMAIL_VERIFICATION_SECRET?.trim() || "autonexa";

export const hashKey = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

/** Counts a visitor without keeping who they are: changes daily and differs per dealership. */
export function visitorHash(tenantId: string, store: { get(name: string): string | null }) {
  const day = new Date().toISOString().slice(0, 10);
  return hashKey(`${tenantId}|${day}|${clientAddress(store)}|${store.get("user-agent") ?? ""}`);
}

export const siteVisitorHash = (site: Pick<Site, "tenantId">, store: { get(name: string): string | null }) =>
  visitorHash(site.tenantId, store);

const HOUR = 60 * 60;

/** Per visitor, and overall per site in case addresses are spoofed or rotated. */
export async function withinEnquiryLimits(site: Pick<Site, "tenantId">, store: { get(name: string): string | null }) {
  const address = hashKey(clientAddress(store));
  return (
    (await hitRateLimit(`enquiry:visitor:${site.tenantId}:${address}`, 5, HOUR)) &&
    (await hitRateLimit(`enquiry:site:${site.tenantId}`, 200, HOUR))
  );
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|monitor/i;

/** After the response, so a slow write never slows a page. Never fails the page either. */
export async function trackEvent(
  site: Site,
  kind: "page_view" | "vehicle_view",
  details: { path: string; vehicleId?: string | null },
) {
  if (!site.analyticsEnabled) return;
  const store = await headers();
  if (BOT.test(store.get("user-agent") ?? "")) return;
  const hash = visitorHash(site.tenantId, store);
  let referrer: string | null = null;
  try {
    const url = store.get("referer");
    if (url) {
      const host = new URL(url).hostname;
      referrer = host === site.host ? null : host.slice(0, 200);
    }
  } catch {
    /* Not a URL. */
  }
  after(async () => {
    const { error } = await siteClient(site)
      .from("storefront_events" as never)
      .insert({
        kind,
        path: details.path.slice(0, 300),
        vehicle_id: details.vehicleId ?? null,
        visitor_hash: hash,
        referrer_host: referrer,
      } as never);
    if (error) console.error("[storefront] could not record event", error.message);
  });
}
