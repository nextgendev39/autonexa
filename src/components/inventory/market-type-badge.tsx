"use client";

import { GaugeIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Sheen } from "@/components/inventory/vehicle-sold-tag";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VehicleMarketType } from "@/types/vehicle";

// New is solid brand gold; Used is polished chrome (silver) with carbon lettering, so the
// two read as a matched pair and both stand out on photos in light and dark themes.
const STYLES: Record<VehicleMarketType, string> = {
  new: "bg-gold text-brand-foreground border-transparent font-semibold shadow-sm",
  used: "bg-(image:--chrome-gradient) text-sidebar border-transparent font-semibold shadow-sm ring-1 ring-inset ring-black/10",
};

const ICONS: Record<VehicleMarketType, typeof SparklesIcon> = {
  new: SparklesIcon,
  used: GaugeIcon,
};

export function MarketTypeBadge({
  value,
  className,
}: {
  value: VehicleMarketType | null | undefined;
  className?: string;
}) {
  const t = useTranslations();
  const type: VehicleMarketType = value === "new" ? "new" : "used";
  const Icon = ICONS[type];

  return (
    <Badge variant="outline" className={cn(STYLES[type], className)}>
      <Icon data-icon="inline-start" aria-hidden />
      {t(`inventory.enums.marketType.${type}`)}
    </Badge>
  );
}

/** Gold "New" badge laid over a new car's main photo. */
export function NewCarBadge({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        "animate-pop relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full ps-1 pe-3.5",
        "bg-gold text-brand-foreground shadow-lg ring-1 shadow-black/25 ring-white/30",
        className,
      )}
    >
      <Sheen />
      <span className="flex size-6 items-center justify-center rounded-full bg-black/15">
        <SparklesIcon className="size-3.5" aria-hidden />
      </span>
      <span className="text-xs font-bold tracking-[0.2em] uppercase">
        {t("inventory.enums.marketType.new")}
      </span>
    </span>
  );
}

/** Chrome "Used" badge laid over a used car's main photo; the silver twin of NewCarBadge. */
export function UsedCarBadge({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        "animate-pop relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full ps-1 pe-3.5",
        "text-sidebar bg-(image:--chrome-gradient) shadow-lg ring-1 shadow-black/25 ring-white/40",
        className,
      )}
    >
      <Sheen />
      <span className="flex size-6 items-center justify-center rounded-full bg-black/10">
        <GaugeIcon className="size-3.5" aria-hidden />
      </span>
      <span className="text-xs font-bold tracking-[0.2em] uppercase">
        {t("inventory.enums.marketType.used")}
      </span>
    </span>
  );
}
