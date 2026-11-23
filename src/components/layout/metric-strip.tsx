import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const DOTS = {
  neutral: "bg-subtle-foreground",
  brand: "bg-brand",
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-destructive",
} as const;

export type MetricTone = keyof typeof DOTS;

/**
 * AutoNexa metric strip: a list page's summary as one elevated panel divided into cells,
 * rather than a row of separate tiles. Cells tied to a filter are buttons; the selected one
 * takes the card gradient and a champagne baseline.
 */
export function MetricStrip({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "bg-card rounded-panel divide-divider grid grid-cols-2 overflow-hidden border shadow-sm lg:auto-cols-fr lg:grid-flow-col lg:divide-x rtl:lg:divide-x-reverse max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-e",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function MetricStripItem({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  selected = false,
  onSelect,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} aria-hidden />
        <span className="truncate">{label}</span>
        {Icon ? (
          <Icon className="text-subtle-foreground ms-auto size-4 shrink-0" aria-hidden />
        ) : null}
      </span>
      <span className="figure truncate text-[1.375rem] sm:text-[1.625rem]">{value}</span>
      {hint ? <span className="text-subtle-foreground truncate text-xs">{hint}</span> : null}
      {selected ? (
        <span className="bg-brand absolute inset-x-4 bottom-0 h-0.5 rounded-full" aria-hidden />
      ) : null}
    </>
  );
  const base = "relative grid min-w-0 content-start gap-1.5 px-4 py-3.5 text-start sm:px-5 sm:py-4";
  if (!onSelect) return <div className={base}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        base,
        "transition-colors duration-150 outline-none focus-visible:shadow-[inset_var(--focus-ring)]",
        selected ? "gradient-card" : "hover:bg-muted/50",
      )}
    >
      {content}
    </button>
  );
}
