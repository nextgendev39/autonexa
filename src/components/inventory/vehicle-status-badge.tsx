"use client";

import { BadgeCheckIcon, ShipIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "@/types/vehicle";

const pill = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap";

/**
 * Status chip for a car. The states staff look for most use the brand theme:
 * In transit is chrome with a gliding gold line, Ready for sale is soft gold with a
 * live dot, Sold is carbon with gold lettering.
 */
export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const t = useTranslations();
  const label = t(`inventory.status.${status}`);

  if (status === "acquired") {
    return (
      <span
        className={cn(
          pill,
          "bg-chrome/20 text-foreground/85 ring-chrome/70 relative overflow-hidden ps-1.5 font-semibold ring-1 ring-inset",
        )}
      >
        <ShipIcon className="text-brand-strong dark:text-brand size-3.5 shrink-0" aria-hidden />
        {label}
        {/* On its way: a short gold line glides along the bottom edge. */}
        <span
          className="animate-speed via-brand absolute inset-x-0 bottom-0 h-px w-1/3 bg-linear-to-r from-transparent to-transparent motion-reduce:hidden"
          aria-hidden
        />
      </span>
    );
  }

  if (status === "ready_for_sale") {
    return (
      <span
        className={cn(
          pill,
          "bg-brand-soft text-brand-strong ring-brand/35 dark:text-brand font-semibold ring-1 ring-inset",
        )}
      >
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          <span className="animate-ping-soft bg-brand absolute inset-0 rounded-full motion-reduce:hidden" />
          <span className="bg-brand relative size-1.5 rounded-full" />
        </span>
        {label}
      </span>
    );
  }

  if (status === "sold" || status === "delivered") {
    return (
      <span className={cn(pill, "bg-carbon ring-brand/45 ps-1.5 shadow-sm ring-1 ring-inset")}>
        <BadgeCheckIcon className="text-brand size-3.5 shrink-0" aria-hidden />
        <span className="text-gold font-semibold tracking-wide">{label}</span>
      </span>
    );
  }

  return <StatusBadge status={status} label={label} />;
}
