"use client";

import { useState } from "react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Stock status colours (validated light + dark): in transit blue, ready green, booked amber.
 * Green↔amber is close for protanopes, so every segment is direct-labelled with gaps between.
 */
export const STOCK_COLORS = {
  inTransit: "#2563eb",
  readyForSale: "#059669",
  booked: "#d97706",
} as const;

/* ------------------------------------------------------------- sales bars */

/** Revenue per month, one series (brand gold); hover a column for its figures. */
export function SalesBars({
  points,
  formatValue,
  formatMonth,
  unitsLabel,
}: {
  points: { month: string; revenue: number; units: number }[];
  formatValue: (value: number) => string;
  formatMonth: (month: string) => string;
  unitsLabel: (count: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.revenue), 1);
  const shown = hover ?? points.length - 1;

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="grid">
          <span className="font-heading text-2xl font-semibold tracking-tight tabular-nums">
            {formatValue(points[shown]?.revenue ?? 0)}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatMonth(points[shown]?.month ?? "")} · {unitsLabel(points[shown]?.units ?? 0)}
          </span>
        </div>
      </div>
      <div className="relative">
        {/* Recessive gridlines at 50% and 100% of the tallest month. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px border-t border-dashed" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px border-t border-dashed" aria-hidden />
        <ol className="relative flex h-44 items-end gap-2 border-b sm:gap-3" onMouseLeave={() => setHover(null)}>
          {points.map((point, index) => {
            const height = point.revenue > 0 ? Math.max((point.revenue / max) * 100, 3) : 0;
            const active = index === shown;
            return (
              <li
                key={point.month}
                className="group relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                tabIndex={0}
                aria-label={`${formatMonth(point.month)}: ${formatValue(point.revenue)}, ${unitsLabel(point.units)}`}
              >
                <span
                  className={cn(
                    "animate-grow-y w-full origin-bottom rounded-t-[4px] transition-colors",
                    active ? "bg-gold" : "bg-brand/35 group-hover:bg-brand/55",
                  )}
                  style={{ height: `${height}%`, animationDelay: `${index * 60}ms` }}
                />
              </li>
            );
          })}
        </ol>
        <ol className="mt-2 flex gap-2 sm:gap-3" aria-hidden>
          {points.map((point, index) => (
            <li
              key={point.month}
              className={cn(
                "flex-1 text-center text-[11px]",
                index === shown ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {formatMonth(point.month).split(" ")[0]}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- stock pipeline */

export function StockPipeline({
  parts,
}: {
  parts: { key: keyof typeof STOCK_COLORS; label: string; units: number; href: string }[];
}) {
  const total = parts.reduce((sum, p) => sum + p.units, 0);
  return (
    <div className="grid gap-4">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.units}`).join(", ")}>
        {total === 0 ? (
          <span className="bg-muted h-full w-full" />
        ) : (
          parts
            .filter((p) => p.units > 0)
            .map((p) => (
              <span
                key={p.key}
                className="animate-grow-x h-full origin-left first:rounded-s-full last:rounded-e-full"
                style={{ width: `${(p.units / total) * 100}%`, backgroundColor: STOCK_COLORS[p.key] }}
                title={`${p.label}: ${p.units}`}
              />
            ))
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.key}>
            <Link href={p.href} className="hover:bg-muted/60 grid gap-1 rounded-lg px-2 py-1.5 transition-colors">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: STOCK_COLORS[p.key] }} aria-hidden />
                <span className="truncate">{p.label}</span>
              </span>
              <span className="font-heading text-xl font-semibold tabular-nums">{p.units}</span>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {total > 0 ? `${Math.round((p.units / total) * 100)}%` : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- outcome donut */

const OUTCOME_COLORS = { sold: "#059669", active: "#d97706", cancelled: "var(--muted-foreground)" } as const;

/** Bookings from the last 90 days by outcome, with the conversion rate in the middle. */
export function OutcomeDonut({
  parts,
  centerValue,
  centerLabel,
}: {
  parts: { key: keyof typeof OUTCOME_COLORS; label: string; value: number }[];
  centerValue: string;
  centerLabel: string;
}) {
  const size = 148;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <figure className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          {total > 0
            ? parts.map((p) => {
                if (p.value <= 0) return null;
                const length = Math.max((p.value / total) * c - gap, 0.5);
                const el = (
                  <circle
                    key={p.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={OUTCOME_COLORS[p.key]}
                    strokeWidth={stroke}
                    strokeDasharray={`${length} ${c - length}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{`${p.label}: ${p.value}`}</title>
                  </circle>
                );
                offset += (p.value / total) * c;
                return el;
              })
            : null}
        </svg>
        <figcaption className="absolute inset-0 grid place-content-center text-center">
          <span className="font-heading text-2xl font-semibold tabular-nums">{centerValue}</span>
          <span className="text-muted-foreground text-[11px]">{centerLabel}</span>
        </figcaption>
      </figure>
      <ul className="grid gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: OUTCOME_COLORS[p.key] }} aria-hidden />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="ms-auto ps-4 font-medium tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------- horizontal bars */

/** Labelled horizontal bars for one measure (stock age, sales executives). */
export function HorizontalBars({
  rows,
}: {
  rows: { key: string; label: string; value: number; display: string; detail?: string; barClassName: string }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="grid gap-3">
      {rows.map((row, index) => (
        <li key={row.key} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{row.display}</span>
              {row.detail ? <span className="text-muted-foreground ms-2 text-xs">{row.detail}</span> : null}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className={cn("animate-grow-x h-full origin-left rounded-full rtl:origin-right", row.barClassName)}
              style={{ width: `${row.value > 0 ? Math.max((row.value / max) * 100, 2) : 0}%`, animationDelay: `${index * 70}ms` }}
              title={`${row.label}: ${row.display}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
