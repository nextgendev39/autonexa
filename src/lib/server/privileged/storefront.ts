import "server-only";

import { createPrivilegedClient } from "./client";
import { hostSettingsFromEnv, normalizeHost } from "@/lib/storefront/host";

/**
 * Service-role steps for public visitors, who have no session. Every one is reached only after the
 * host has been resolved, and the dealership always comes from that result, never from a request.
 */
export type ResolvedSite = {
  tenantId: string;
  name: string;
  slug: string;
  kind: "subdomain" | "custom";
  host: string;
  config: unknown;
  displayName: string;
  currency: string;
  defaultLocale: string;
  bookingEnabled: boolean;
  analyticsEnabled: boolean;
};

const rpc = (name: string, args: Record<string, unknown>) =>
  createPrivilegedClient().rpc(name as never, args as never);

export async function resolveStorefrontHost(rawHost: string | null | undefined): Promise<ResolvedSite | null> {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const { data, error } = await rpc("storefront_resolve_host", {
    p_host: host,
    p_base_domain: hostSettingsFromEnv().baseDomain,
  });
  if (error) {
    console.error("[storefront] could not resolve host", error.message);
    return null;
  }
  return (data as unknown as ResolvedSite | null) ?? null;
}

export async function hitRateLimit(key: string, max: number, windowSeconds: number) {
  const { data, error } = await rpc("storefront_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  // If the limiter is down, stay open: a broken counter shouldn't lose real customers.
  if (error) {
    console.error("[storefront] rate limit unavailable", error.message);
    return true;
  }
  return (data as unknown as boolean) === true;
}

/** Views per listed car over the last month. Counts only, never who looked. */
export async function vehiclePopularity(tenantId: string) {
  const { data, error } = await rpc("storefront_vehicle_popularity", { p_tenant_id: tenantId, p_days: 30 });
  if (error) {
    console.error("[storefront] popularity unavailable", error.message);
    return new Map<string, number>();
  }
  return new Map(
    ((data ?? []) as unknown as { vehicle_id: string; views: number | string }[]).map((row) => [
      row.vehicle_id,
      Number(row.views),
    ]),
  );
}

export async function submitEnquiry(input: {
  site: Pick<ResolvedSite, "tenantId" | "host">;
  vehicleId: string | null;
  kind: "enquiry" | "booking_request";
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  message: string | null;
  locale: string;
  visitorHash: string | null;
}) {
  const { data, error } = await rpc("storefront_submit_enquiry", {
    p_tenant_id: input.site.tenantId,
    p_vehicle_id: input.vehicleId,
    p_kind: input.kind,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email,
    p_message: input.message,
    p_locale: input.locale,
    p_host: input.site.host,
    p_visitor_hash: input.visitorHash,
  });
  return { id: (data as unknown as string | null) ?? null, error };
}

export async function recordDomainCheck(
  domainId: string,
  verified: boolean,
  sslStatus: "pending" | "active" | "failed" | null,
  errorCode: string | null,
) {
  const { data, error } = await rpc("storefront_record_domain_check", {
    p_domain_id: domainId,
    p_verified: verified,
    p_ssl_status: sslStatus,
    p_error: errorCode,
  });
  if (error) throw new Error(error.message);
  return (data as unknown as boolean) === true;
}

/** Verified domains not looked at for a day: a name that lapses must stop resolving. */
export async function domainsDueForCheck(limit = 25) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await createPrivilegedClient()
    .from("tenant_domains" as never)
    .select("id, domain, verification_token")
    .eq("verification_status", "verified")
    .or(`last_checked_at.is.null,last_checked_at.lt.${since}`)
    .limit(limit);
  return (data ?? []) as unknown as { id: string; domain: string; verification_token: string }[];
}
