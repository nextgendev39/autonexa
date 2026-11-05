import type { LucideIcon } from "lucide-react";

import type { Permission } from "@/lib/permissions";

export type MobileSlot = "home" | "cars" | "bookings";

export type NavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  mobile?: MobileSlot;
  permission?: Permission;
  /** Label for users who only see their own records (e.g. "My bookings"). */
  ownLabelKey?: string;
};

export type NavGroup = {
  id: string;
  labelKey?: string;
  items: NavItem[];
};
