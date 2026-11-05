/** Mirrors public.platform_role_permissions. Separate from dealership permissions on purpose. */
export const platformPermissions = [
  "console.access",
  "tenants.view",
  "tenants.manage",
  "subscriptions.view",
  "subscriptions.manage",
  "plans.view",
  "plans.manage",
  "billing.view",
  "billing.manage",
  "usage.view",
  "audit.view",
  "admins.manage",
  "catalog.manage",
  "roles.manage",
  "storefronts.view",
  "storefronts.manage",
] as const;

export type PlatformPermission = (typeof platformPermissions)[number];

export const platformRoles = ["owner", "admin", "billing", "support", "catalog"] as const;
export type PlatformRole = (typeof platformRoles)[number];

export type PlatformContext = {
  userId: string;
  email: string | null;
  role: PlatformRole;
  permissions: PlatformPermission[];
};

export const canPlatform = (context: { permissions: readonly string[] }, permission: PlatformPermission) =>
  context.permissions.includes(permission);
