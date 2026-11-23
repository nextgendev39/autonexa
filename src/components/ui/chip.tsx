"use client";

import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * AutoNexa chip: the pill used for filters, selections and tags.
 *  - default:   card surface, hairline border; hover darkens the border.
 *  - selected:  inverted (obsidian in light, ivory in dark) — distinct without extra colour.
 *  - disabled:  dimmed and inert.
 *  - removable: pass `onRemove` for a trailing close button (its own accessible control).
 */
export const chipClass = (selected = false) =>
  cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium whitespace-nowrap shadow-xs outline-none transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
    selected
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-foreground/75 hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_28%)] hover:text-foreground",
  );

export function Chip({
  selected = false,
  onRemove,
  removeLabel,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  selected?: boolean;
  onRemove?: () => void;
  /** Accessible name of the close button, e.g. "Remove Make: Toyota". */
  removeLabel?: string;
}) {
  if (onRemove) {
    return (
      <span className={cn(chipClass(selected), "pe-1", className)}>
        <span className="flex min-w-0 items-center gap-1.5">{children}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="hover:bg-foreground/10 focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
        >
          <XIcon aria-hidden />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(chipClass(selected), className)}
      {...props}
    >
      {children}
    </button>
  );
}

/** Count bubble inside a chip; inverts with the chip, red when the bucket needs attention. */
export function ChipCount({
  children,
  selected = false,
  alert = false,
}: {
  children: React.ReactNode;
  selected?: boolean;
  alert?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        alert
          ? "bg-destructive text-white"
          : selected
            ? "bg-background/20 text-background"
            : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** A scrolling rail of single-select chips acting as tabs (list filters). */
export function ChipTabs<T extends string>({
  label,
  value,
  onChange,
  items,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string; count?: React.ReactNode; alert?: boolean }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "-mx-1 flex min-w-0 touch-pan-x [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={chipClass(selected)}
          >
            {item.label}
            {item.count != null ? (
              <ChipCount selected={selected} alert={item.alert}>
                {item.count}
              </ChipCount>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
