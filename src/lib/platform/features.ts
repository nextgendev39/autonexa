import type { Permission } from "@/lib/permissions";

export type PlanFeature =
  | "acquisitions"
  | "pricing"
  | "bookings"
  | "staff_documents"
  | "vehicle_sharing"
  | "storefront"
  | "storefront_custom_domain"
  | "storefront_booking"
  | "storefront_analytics";

/** Mirrors public.platform_features.permission_modules. The database enforces this as well. */
const FEATURE_BY_MODULE: Record<string, PlanFeature> = {
  acquisition: "acquisitions",
  pricing: "pricing",
  reservation: "bookings",
  sale: "bookings",
  storefront: "storefront",
};

export function featureForPermission(permission: Permission | string): PlanFeature | null {
  return FEATURE_BY_MODULE[permission.split(".")[0]] ?? null;
}

export function permissionAllowedByPlan(
  permission: Permission | string,
  disabledFeatures: readonly string[],
) {
  const feature = featureForPermission(permission);
  return !feature || !disabledFeatures.includes(feature);
}
