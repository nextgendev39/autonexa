import { CalendarCheckIcon, CarIcon, UserPlusIcon } from "lucide-react";

export const protectedPrefixes = [
  "/dashboard",
  "/inventory",
  "/bookings",
  "/acquisitions",
  "/pricing",
  "/customers",
  "/reservations",
  "/documents",
  "/branches",
  "/users",
  "/vehicle-catalog",
  "/roles",
  "/audit-logs",
  "/notifications",
  "/settings",
  "/storefront",
  "/billing",
  "/profile",
  "/unauthorized",
  "/platform",
] as const;

const publicAuthPaths = new Set([
  "/login",
  "/forgot-password",
  "/forgot-password/verify",
  "/reset-password",
  "/accept-invitation",
  "/verify-email",
]);

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isPublicAuthPath(pathname: string) {
  return publicAuthPaths.has(pathname);
}

/** Breadcrumb labels for users who only see their own records. */
/** Step forms that pin their own bars to the edges, so they get the whole screen. */
export const FOCUS_ROUTES = /^\/inventory\/(new|[^/]+\/edit)\/?$/;

export const ownBreadcrumbLabels: Record<string, string> = {
  bookings: "nav.myBookings",
};

export const breadcrumbLabels: Record<string, string> = {
  dashboard: "nav.dashboard",
  inventory: "nav.inventory",
  bookings: "nav.bookings",
  acquisitions: "nav.acquisitions",
  pricing: "nav.pricing",
  customers: "nav.customers",
  reservations: "nav.reservations",
  documents: "nav.documents",
  branches: "nav.branches",
  users: "nav.users",
  "vehicle-catalog": "nav.vehicleCatalog",
  roles: "nav.roles",
  "audit-logs": "nav.auditLogs",
  notifications: "nav.notifications",
  settings: "nav.settings",
  storefront: "nav.storefront",
  billing: "nav.billing",
  profile: "nav.profile",
  new: "common.new",
  edit: "inventory.actions.edit",
  login: "auth.login.title",
  unauthorized: "auth.unauthorized.title",
};

export const searchGroups = [
  { id: "vehicles", labelKey: "search.groups.vehicles", href: "/inventory", permission: "vehicle.view" },
  { id: "customers", labelKey: "search.groups.customers", href: "/customers", permission: "customer.view" },
  {
    id: "documents",
    labelKey: "search.groups.documents",
    href: "/documents",
    permission: "document.view",
  },
] as const;

export const quickActions = [
  { href: "/inventory/new", labelKey: "quick.vehicle", permission: "vehicle.create", icon: CarIcon },
  { href: "/customers/new", labelKey: "quick.customer", permission: "customer.create", icon: UserPlusIcon },
  { href: "/bookings?new=1", labelKey: "quick.booking", permission: "reservation.create", icon: CalendarCheckIcon },
] as const;
