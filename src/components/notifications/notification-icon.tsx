import type { LucideIcon } from "lucide-react";
import {
  BadgeCheckIcon,
  BellIcon,
  CalendarPlusIcon,
  CarIcon,
  CircleXIcon,
  ShieldCheckIcon,
  ShieldEllipsisIcon,
  ShieldXIcon,
  TimerOffIcon,
  WalletIcon,
} from "lucide-react";

import {
  BOOKING_AUTO_CANCELLED,
  BOOKING_BALANCE_OVERDUE,
  BOOKING_CANCELLED,
  BOOKING_CREATED,
  BOOKING_HOLD_APPROVED,
  BOOKING_HOLD_REJECTED,
  BOOKING_HOLD_REQUESTED,
  BOOKING_SOLD,
  VEHICLE_READY_FOR_SALE,
  VEHICLE_SOLD,
} from "@/components/notifications/use-notification-text";
import { cn } from "@/lib/utils";

/** Filter groups on the notifications screen. */
export type NotificationCategory =
  "booking" | "ready" | "sale" | "cancellation" | "payment" | "other";

const kinds: Record<string, { icon: LucideIcon; tone: string; category: NotificationCategory }> = {
  [BOOKING_CREATED]: {
    icon: CalendarPlusIcon,
    tone: "bg-brand-soft text-brand",
    category: "booking",
  },
  [BOOKING_SOLD]: {
    icon: BadgeCheckIcon,
    tone: "bg-success-soft text-success-foreground",
    category: "sale",
  },
  [VEHICLE_SOLD]: {
    icon: BadgeCheckIcon,
    tone: "bg-success-soft text-success-foreground",
    category: "sale",
  },
  [VEHICLE_READY_FOR_SALE]: {
    icon: CarIcon,
    tone: "bg-info-soft text-info-foreground",
    category: "ready",
  },
  [BOOKING_CANCELLED]: {
    icon: CircleXIcon,
    tone: "bg-danger-soft text-danger-foreground",
    category: "cancellation",
  },
  [BOOKING_AUTO_CANCELLED]: {
    icon: TimerOffIcon,
    tone: "bg-danger-soft text-danger-foreground",
    category: "cancellation",
  },
  [BOOKING_HOLD_REQUESTED]: {
    icon: ShieldEllipsisIcon,
    tone: "bg-info-soft text-info-foreground",
    category: "payment",
  },
  [BOOKING_HOLD_APPROVED]: {
    icon: ShieldCheckIcon,
    tone: "bg-success-soft text-success-foreground",
    category: "payment",
  },
  [BOOKING_HOLD_REJECTED]: {
    icon: ShieldXIcon,
    tone: "bg-danger-soft text-danger-foreground",
    category: "payment",
  },
  [BOOKING_BALANCE_OVERDUE]: {
    icon: WalletIcon,
    tone: "bg-warning-soft text-warning-foreground",
    category: "payment",
  },
};

const fallback = {
  icon: BellIcon,
  tone: "bg-muted text-foreground/70",
  category: "other",
} as const;

export function notificationCategory(type: string): NotificationCategory {
  return (kinds[type] ?? fallback).category;
}

/** Tinted icon tile for a notification type. */
export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const { icon: Icon, tone } = kinds[type] ?? fallback;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        tone,
        className,
      )}
      aria-hidden
    >
      <Icon className="size-[1.125rem]" />
    </span>
  );
}
