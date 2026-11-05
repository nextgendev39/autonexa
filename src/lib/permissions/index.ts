/**
 * Permission keys mirror public.permissions.key.
 * Frontend checks are UX only — RLS and server requirePermission are the boundary.
 */
export const permissionCatalog = [
  "dashboard.view",
  "vehicle.view",
  "vehicle.create",
  "vehicle.edit",
  "vehicle.delete",
  "vehicle.status.change",
  "vehicle.ready_for_sale",
  "vehicle.ready_for_sale.override",
  "vehicle.branch.transfer",
  "vehicle.archive",
  "vehicle.cost.view",
  "vehicle.cost.edit",
  "vehicle.price.view",
  "vehicle.price.edit",
  "vehicle.profit.view",
  "pricing.view",
  "pricing.create",
  "pricing.update",
  "pricing.approve",
  "pricing.discount.approve",
  "pricing.override_minimum",
  "pricing.history.view",
  "acquisition.view",
  "acquisition.create",
  "acquisition.edit",
  "acquisition.approve",
  "acquisition.cancel",
  "acquisition.cost.view",
  "acquisition.cost.edit",
  "acquisition.expense.view",
  "acquisition.expense.create",
  "acquisition.expense.edit",
  "customer.view",
  "customer.create",
  "customer.edit",
  "reservation.view",
  "reservation.create",
  "reservation.cancel",
  "sale.view",
  "sale.create",
  "sale.edit",
  "sale.cancel",
  "document.view",
  "document.create",
  "document.edit",
  "report.view",
  "report.financial.view",
  "branch.view",
  "branch.manage",
  "user.manage",
  "role.manage",
  "audit.view",
  "notification.view",
  "settings.view",
  "settings.manage",
  "storefront.manage",
  "billing.manage",
] as const;

export type Permission = (typeof permissionCatalog)[number];

const permissionSet = new Set<string>(permissionCatalog);

export function isPermission(value: string): value is Permission {
  return permissionSet.has(value);
}

export function hasPermission(
  permissions: readonly string[],
  permission: Permission,
  roles: readonly string[] = [],
) {
  if (roles.includes("super_admin")) return true;
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: readonly string[],
  required: readonly Permission[],
  roles: readonly string[] = [],
) {
  return required.some((permission) => hasPermission(permissions, permission, roles));
}

/** @deprecated Use hasPermission with UserContext.permissions */
export function canAccess(permission: Permission, permissions: readonly string[] | null) {
  if (!permissions) return false;
  return hasPermission(permissions, permission);
}

/** Route → required permission. First matching prefix wins (longest should be listed first). */
export const routePermissions: { prefix: string; permission: Permission }[] = [
  { prefix: "/pricing", permission: "pricing.view" }, // legacy redirects → inventory
  { prefix: "/inventory/new", permission: "vehicle.create" },
  { prefix: "/inventory", permission: "vehicle.view" }, // includes /inventory/[id] and /edit
  { prefix: "/acquisitions", permission: "acquisition.view" }, // legacy redirects → inventory
  { prefix: "/customers/new", permission: "customer.create" },
  { prefix: "/customers", permission: "customer.view" },
  { prefix: "/reservations", permission: "reservation.view" }, // legacy redirects → inventory
  { prefix: "/bookings", permission: "reservation.view" },
  { prefix: "/documents", permission: "document.view" },
  { prefix: "/branches", permission: "branch.view" },
  { prefix: "/users", permission: "user.manage" },
  { prefix: "/vehicle-catalog", permission: "settings.manage" },
  { prefix: "/roles", permission: "role.manage" },
  { prefix: "/audit-logs", permission: "audit.view" },
  { prefix: "/notifications", permission: "notification.view" },
  { prefix: "/settings", permission: "settings.view" },
  { prefix: "/storefront", permission: "storefront.manage" },
  { prefix: "/billing", permission: "billing.manage" },
  { prefix: "/dashboard", permission: "dashboard.view" },
];

export function permissionForPath(pathname: string): Permission | null {
  const match = routePermissions.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  return match?.permission ?? null;
}
