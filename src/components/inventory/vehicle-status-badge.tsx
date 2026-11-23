"use client";

import { BadgeCheckIcon, CircleCheckIcon, ShipIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { statusTones, statusTone } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "@/types/vehicle";

const ICONS: Partial<Record<VehicleStatus, typeof ShipIcon>> = {
  acquired: ShipIcon,
  ready_for_sale: CircleCheckIcon,
  sold: BadgeCheckIcon,
  delivered: BadgeCheckIcon,
};

/**
 * A car's status pill: the shared semantic tone (available green, sold blue, pending amber…)
 * with an icon for the states staff scan for most, and a dot for the rest.
 */
export function VehicleStatusBadge({
  status,
  className,
}: {
  status: VehicleStatus;
  className?: string;
}) {
  const t = useTranslations();
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        Icon && "ps-2",
        statusTones[statusTone(status)],
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      )}
      {t(`inventory.status.${status}`)}
    </span>
  );
}
