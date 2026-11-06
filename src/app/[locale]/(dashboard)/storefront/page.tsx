import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { StorefrontManager } from "@/components/storefront/manager";
import { requirePagePermission } from "@/lib/auth/authorize";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  getAnalytics,
  getStorefront,
  listBookingSalespeople,
  listEnquiries,
  listManagedDomains,
  listManagedVehicles,
} from "@/lib/storefront/manage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("storefrontAdmin");
  return { title: t("title") };
}

export default async function Page() {
  const context = await requirePagePermission("storefront.manage");
  const off = context.disabledFeatures;
  const canAnalytics = !off.includes("storefront_analytics");
  const canViewEnquiries = hasPermission(context.permissions, "customer.view", context.roles);
  const canBooking =
    !off.includes("bookings") &&
    hasPermission(context.permissions, "reservation.create", context.roles);

  const supabase = await createClient();
  const [storefront, managed, domains, enquiries, analytics, salespeople, tenant, settings] =
    await Promise.all([
      getStorefront(context),
      listManagedVehicles(),
      listManagedDomains(),
      canViewEnquiries ? listEnquiries() : Promise.resolve([]),
      canAnalytics ? getAnalytics() : Promise.resolve(null),
      canBooking ? listBookingSalespeople() : Promise.resolve([]),
      supabase
        .from("tenants" as never)
        .select("slug")
        .maybeSingle(),
      supabase
        .from("tenant_settings" as never)
        .select("currency")
        .maybeSingle(),
    ]);
  const slug = (tenant.data as unknown as { slug: string } | null)?.slug;
  const base = process.env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN?.trim();

  return (
    <StorefrontManager
      {...storefront}
      address={slug && base ? `${slug}.${base}` : null}
      cnameTarget={process.env.NEXT_PUBLIC_STOREFRONT_CNAME_TARGET?.trim() || null}
      currency={(settings.data as unknown as { currency: string } | null)?.currency ?? "AED"}
      vehicles={managed.vehicles}
      detailsReady={managed.detailsReady}
      domains={domains}
      enquiries={enquiries}
      analytics={analytics}
      salespeople={salespeople}
      canCustomDomain={!off.includes("storefront_custom_domain")}
      canBooking={canBooking}
      canAnalytics={canAnalytics}
    />
  );
}
