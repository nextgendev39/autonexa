import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Status dot beside the label — the tone is a cue, never the only one (the label says it). */
const dots = {
  neutral: "bg-subtle-foreground",
  brand: "bg-sidebar-primary",
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-destructive",
  violet: "bg-gold",
} as const;

export type KpiTone = keyof typeof dots;

/**
 * AutoNexa instrument tile: tone dot and small-caps label, a large display figure, and a
 * one-line hint. The `brand` tone is the hero tile — an obsidian panel with a champagne
 * figure in both themes — meant for the single most important number on a screen.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: KpiTone;
  hint?: string;
}) {
  const hero = tone === "brand";
  return (
    <div
      className={cn(
        "relative isolate flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-xl border p-4 transition-[border-color] duration-200 sm:min-h-[8.5rem] sm:p-5",
        hero
          ? "bg-brand-panel border-transparent"
          : "bg-card hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_14%)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "flex min-w-0 items-center gap-2 text-[0.6875rem] leading-4 font-semibold tracking-[0.1em] uppercase",
            hero ? "text-sidebar-foreground/70" : "text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden />
          <span className="line-clamp-2">{label}</span>
        </p>
        {Icon ? (
          <Icon
            className={cn(
              "size-4 shrink-0",
              hero ? "text-sidebar-primary" : "text-subtle-foreground",
            )}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "figure truncate text-[1.625rem] sm:text-[1.875rem]",
            hero && "text-gold pb-0.5",
          )}
        >
          {value}
        </p>
        {hint ? (
          <p
            className={cn(
              "mt-1.5 truncate text-xs",
              hero ? "text-sidebar-foreground/60" : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
