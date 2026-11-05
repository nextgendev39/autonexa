"use client";

import { LayersIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Shown only for multi-unit records, next to the status and market type badges. */
export function QuantityBadge({ quantity, className }: { quantity: number; className?: string }) {
  const t = useTranslations();
  if (quantity < 2) return null;
  return (
    <Badge
      variant="outline"
      className={cn("border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200", className)}
    >
      <LayersIcon data-icon="inline-start" aria-hidden />
      {t("inventory.quantity.units", { count: quantity })}
    </Badge>
  );
}
