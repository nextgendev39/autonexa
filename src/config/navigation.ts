import {
  Bell,
  Building2,
  CalendarCheck,
  Car,
  Library,
  FolderOpen,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

import type { Permission } from "@/lib/permissions";
import { canViewAllBookings } from "@/lib/permissions/roles";
import type { NavGroup, NavItem } from "@/types/navigation";

export const navigation: NavGroup[] = [
  {
    id: "overview",
    items: [
      {
        href: "/dashboard",
        labelKey: "nav.dashboard",
        icon: LayoutDashboard,
        mobile: "home",
        permission: "dashboard.view",
      },
    ],
  },
  {
    id: "operations",
    labelKey: "nav.groups.operations",
    items: [
      {
        href: "/inventory",
        labelKey: "nav.inventory",
        icon: Car,
        mobile: "cars",
        permission: "vehicle.view",
      },
      {
        href: "/bookings",
        labelKey: "nav.bookings",
        ownLabelKey: "nav.myBookings",
        icon: CalendarCheck,
        mobile: "bookings",
        permission: "reservation.view",
      },
    ],
  },
  {
    id: "crm",
    labelKey: "nav.groups.crm",
    items: [
      { href: "/customers", labelKey: "nav.customers", icon: Users, permission: "customer.view" },
    ],
  },
  {
    id: "insights",
    labelKey: "nav.groups.insights",
    items: [
      {
        href: "/documents",
        labelKey: "nav.documents",
        icon: FolderOpen,
        permission: "document.view",
      },
    ],
  },
  {
    id: "admin",
    labelKey: "nav.groups.admin",
    items: [
      { href: "/branches", labelKey: "nav.branches", icon: Building2, permission: "branch.view" },
      { href: "/users", labelKey: "nav.users", icon: UserCog, permission: "user.manage" },
      {
        href: "/vehicle-catalog",
        labelKey: "nav.vehicleCatalog",
        icon: Library,
        permission: "settings.manage",
      },
    ],
  },
  {
    id: "system",
    labelKey: "nav.groups.system",
    items: [
      {
        href: "/notifications",
        labelKey: "nav.notifications",
        icon: Bell,
        permission: "notification.view",
      },
      { href: "/settings", labelKey: "nav.settings", icon: Settings, permission: "settings.view" },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The label to show for an item, given the user's roles. */
export function navLabelKey(item: NavItem, roles: readonly string[]) {
  return item.ownLabelKey && !canViewAllBookings(roles) ? item.ownLabelKey : item.labelKey;
}

export function filterNavigation(
  groups: NavGroup[],
  can: (permission: Permission) => boolean,
  roles: readonly string[] = [],
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.permission || can(item.permission))
        .map((item) => ({ ...item, labelKey: navLabelKey(item, roles) })),
    }))
    .filter((group) => group.items.length > 0);
}
