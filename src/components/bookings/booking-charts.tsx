"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Payment colours (validated light + dark): deposit blue, balance green, outstanding amber.
 * Green↔amber is close for protanopes, so outstanding also carries a hatch, segments are
 * separated by gaps, and every value is labelled in text next to the chart.
 */
export const PAYMENT_COLORS = {
  deposit: "#2563eb",
  balance: "#059669",
  outstanding: "#d97706",
} as const;

export type PaymentPart = { key: keyof typeof PAYMENT_COLORS; label: string; value: number; display: string };

function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={PAYMENT_COLORS.outstanding} />
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2" strokeOpacity="0.55" />
    </pattern>
  );
}

/** Ring of how much of the total has been collected, with the share in the middle. */
export function PaymentRing({
  parts,
  centerValue,
  centerLabel,
  size = 176,
}: {
  parts: PaymentPart[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const hatchId = useId();
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && parts.filter((p) => p.value > 0).length > 1 ? 3 : 0;

  let offset = 0;
  return (
    <figure className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <Hatch id={hatchId} />
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {total > 0
          ? parts.map((part) => {
              if (part.value <= 0) return null;
              const length = Math.max((part.value / total) * c - gap, 0.5);
              const segment = (
                <circle
                  key={part.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={part.key === "outstanding" ? `url(#${hatchId})` : PAYMENT_COLORS[part.key]}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                  strokeDasharray={`${length} ${c - length}`}
                  strokeDashoffset={-offset}
                  className="transition-[stroke-dasharray] duration-700"
                >
                  <title>{`${part.label}: ${part.display}`}</title>
                </circle>
              );
              offset += (part.value / total) * c;
              return segment;
            })
          : null}
      </svg>
      <figcaption className="absolute inset-0 grid place-content-center text-center">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{centerValue}</span>
        <span className="text-muted-foreground text-xs">{centerLabel}</span>
      </figcaption>
    </figure>
  );
}

/** Single stacked bar of the same parts, with a legend underneath. */
export function PaymentBar({ parts, label }: { parts: PaymentPart[]; label: string }) {
  const hatchId = useId();
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);

  return (
    <div className="grid gap-3">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 w-full" role="img" aria-label={label}>
        <defs>
          <Hatch id={hatchId} />
        </defs>
        <rect width="100" height="10" rx="5" fill="var(--muted)" />
        {total > 0
          ? (() => {
              let x = 0;
              return visible.map((part, index) => {
                const width = (part.value / total) * 100;
                const rect = (
                  <rect
                    key={part.key}
                    x={x + (index > 0 ? 0.6 : 0)}
                    width={Math.max(width - (index > 0 ? 0.6 : 0), 0.4)}
                    height="10"
                    fill={part.key === "outstanding" ? `url(#${hatchId})` : PAYMENT_COLORS[part.key]}
                  >
                    <title>{`${part.label}: ${part.display}`}</title>
                  </rect>
                );
                x += width;
                return rect;
              });
            })()
          : null}
      </svg>
      <ul className="grid gap-2 sm:grid-cols-3">
        {parts.map((part) => (
          <li key={part.key} className="flex items-start gap-2">
            <span
              className={cn("mt-1 size-2.5 shrink-0 rounded-[3px]", part.key === "outstanding" && "bg-[repeating-linear-gradient(45deg,#d97706_0_3px,#f3c58a_3px_5px)]")}
              style={part.key === "outstanding" ? undefined : { backgroundColor: PAYMENT_COLORS[part.key] }}
              aria-hidden
            />
            <span className="grid">
              <span className="text-muted-foreground text-xs">{part.label}</span>
              <span className="text-sm font-medium tabular-nums">{part.display}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thin progress ring for time elapsed toward a deadline. */
export function CountdownRing({
  progress,
  tone,
  children,
  size = 120,
}: {
  /** 0–1 share of the time used up. */
  progress: number;
  tone: "neutral" | "warning" | "critical" | "good";
  children: React.ReactNode;
  size?: number;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const used = Math.min(Math.max(progress, 0), 1);
  const color =
    tone === "critical"
      ? "var(--destructive)"
      : tone === "warning"
        ? PAYMENT_COLORS.outstanding
        : tone === "good"
          ? PAYMENT_COLORS.balance
          : "var(--brand)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${used * c} ${c}`}
          className="transition-[stroke-dasharray] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  );
}
