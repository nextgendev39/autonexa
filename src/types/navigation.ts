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
  /** Changes data shared by every dealership, so only people who may edit it see it. */
  catalogOnly?: boolean;
  /** Hidden when the dealership's plan doesn't include this module. */
  feature?: string;
};

export type NavGroup = {
  id: string;
  labelKey?: string;
  items: NavItem[];
};
