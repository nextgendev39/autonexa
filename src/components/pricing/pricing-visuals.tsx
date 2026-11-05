"use client";

import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CarFrontIcon,
  CoinsIcon,
  HistoryIcon,
  LandmarkIcon,
  LineChartIcon,
  MinusIcon,
  PercentIcon,
  PieChartIcon,
  ShieldIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { KpiCard, type KpiTone } from "@/components/cards/kpi-card";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";
import { formatDate, formatRelativeTime } from "@/lib/utils/date";
import type { VehiclePricingHistoryItem, VehicleProfitability } from "@/types/pricing";

function useMoney(currency?: string) {
  const locale = useAppLocale();
  return (value: number) => formatCurrency(value, locale, currency || undefined);
}

function ChartTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <span className="bg-brand-soft text-brand flex size-8 items-center justify-center rounded-lg">
        <Icon className="size-4" aria-hidden />
      </span>
      {children}
    </CardTitle>
  );
}

/* --------------------------------------------------------------- KPIs */

export function PricingKpis({
  p,
  totalCost,
  canCost,
  canProfit,
}: {
  p: VehicleProfitability;
  totalCost: number | null;
  canCost: boolean;
  canProfit: boolean;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const money = useMoney(p.currency);
  const fmt = (value: number | null | undefined) => (value == null ? "—" : money(value));
  const profitTone: KpiTone =
    p.expectedGrossProfit == null ? "neutral" : p.expectedGrossProfit < 0 ? "danger" : "success";

  const tiles: { key: string; label: string; value: string; icon: LucideIcon; tone: KpiTone }[] = [
    ...(canCost ? [{ key: "cost", label: t("pricing.summary.totalCost"), value: fmt(totalCost), icon: LandmarkIcon, tone: "neutral" as KpiTone }] : []),
    { key: "min", label: t("pricing.fields.minimum"), value: fmt(p.minimumSellingPrice), icon: ShieldIcon, tone: "warning" },
    { key: "target", label: t("pricing.fields.target"), value: fmt(p.targetSellingPrice ?? p.currentSellingPrice), icon: TargetIcon, tone: "brand" },
    ...(canProfit
      ? [
          { key: "profit", label: t("pricing.summary.expectedProfit"), value: fmt(p.expectedGrossProfit), icon: p.expectedGrossProfit != null && p.expectedGrossProfit < 0 ? TrendingDownIcon : TrendingUpIcon, tone: profitTone },
          {
            key: "margin",
            label: t("pricing.summary.margin"),
            value: p.expectedMarginPercent == null ? "—" : formatPercent(p.expectedMarginPercent / 100, locale),
            icon: PercentIcon,
            tone: profitTone === "danger" ? ("danger" as KpiTone) : ("violet" as KpiTone),
          },
        ]
      : []),
  ];

  return (
    <section className="stagger grid grid-cols-2 gap-3 [--stagger:70ms] md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <KpiCard key={tile.key} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} />
      ))}
    </section>
  );
}

/* --------------------------------------------------------- price corridor */

/**
 * A single price line from cost to the advertised price, split into zones:
 * loss (below cost), protected (cost → minimum, needs approval) and
 * negotiation (minimum → target). Markers show every price point at once.
 */
export function PriceCorridor({ p, totalCost }: { p: VehicleProfitability; totalCost: number | null }) {
  const t = useTranslations();
  const money = useMoney(p.currency);
  const target = p.targetSellingPrice ?? p.currentSellingPrice;
  const floor =
    target != null && p.maximumDiscountAmount != null && p.maximumDiscountAmount > 0
      ? target - p.maximumDiscountAmount
      : null;

  const markers = [
    { key: "cost", label: t("pricing.visual.markers.cost"), value: totalCost, color: "bg-rose-500" },
    { key: "minimum", label: t("pricing.visual.markers.minimum"), value: p.minimumSellingPrice, color: "bg-amber-500" },
    { key: "floor", label: t("pricing.visual.markers.floor"), value: floor, color: "bg-sky-500" },
    { key: "target", label: t("pricing.visual.markers.target"), value: target, color: "bg-[var(--brand)]" },
    {
      key: "advertised",
      label: t("pricing.visual.markers.advertised"),
      value: p.advertisedPrice !== target ? p.advertisedPrice : null,
      color: "bg-violet-500",
    },
  ].filter((m): m is { key: string; label: string; value: number; color: string } => m.value != null && m.value > 0);

  if (markers.length < 2) return null;

  const values = markers.map((m) => m.value);
  const span = Math.max(...values) - Math.min(...values) || Math.max(...values) * 0.1;
  const lo = Math.min(...values) - span * 0.12;
  const hi = Math.max(...values) + span * 0.08;
  const pos = (value: number) => Math.min(100, Math.max(0, ((value - lo) / (hi - lo)) * 100));

  const zones = [
    totalCost != null ? { key: "loss", from: lo, to: totalCost, cls: "bg-rose-500/20" } : null,
    totalCost != null && p.minimumSellingPrice != null && p.minimumSellingPrice > totalCost
      ? { key: "protected", from: totalCost, to: p.minimumSellingPrice, cls: "bg-amber-500/25" }
      : null,
    p.minimumSellingPrice != null && target != null && target > p.minimumSellingPrice
      ? { key: "negotiation", from: p.minimumSellingPrice, to: target, cls: "bg-emerald-500/25" }
      : null,
    target != null ? { key: "premium", from: target, to: hi, cls: "bg-[var(--brand-soft)]" } : null,
  ].filter((z): z is { key: string; from: number; to: number; cls: string } => z != null);

  // Labels alternate above/below the line so neighbouring prices don't collide.
  const sorted = [...markers].sort((a, b) => a.value - b.value);

  return (
    <Card className="animate-rise h-full [animation-delay:120ms]">
      <CardHeader>
        <ChartTitle icon={CoinsIcon}>{t("pricing.visual.corridorTitle")}</ChartTitle>
        <CardDescription>{t("pricing.visual.corridorHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="relative px-1 pt-12 pb-12" role="img" aria-label={sorted.map((m) => `${m.label} ${money(m.value)}`).join(", ")}>
          <div className="bg-muted relative h-4 overflow-hidden rounded-full">
            {zones.map((zone, index) => (
              <div
                key={zone.key}
                className={cn("animate-grow-x absolute inset-y-0 ltr:origin-left rtl:origin-right", zone.cls)}
                style={{
                  insetInlineStart: `${pos(zone.from)}%`,
                  width: `${pos(zone.to) - pos(zone.from)}%`,
                  animationDelay: `${150 + index * 120}ms`,
                }}
              />
            ))}
          </div>
          {sorted.map((marker, index) => {
            const above = index % 2 === 0;
            return (
              <div
                key={marker.key}
                className="animate-pop absolute top-12 flex -translate-x-1/2 flex-col items-center rtl:translate-x-1/2"
                style={{ insetInlineStart: `${pos(marker.value)}%`, animationDelay: `${400 + index * 90}ms` }}
              >
                <span className={cn(marker.color, "ring-card relative z-10 -mt-1 h-6 w-1.5 rounded-full ring-2")} />
                <span
                  className={cn(
                    "absolute grid w-max max-w-28 justify-items-center text-center leading-tight",
                    above ? "bottom-7" : "top-7",
                  )}
                >
                  <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">{marker.label}</span>
                  <span className="text-xs font-semibold tabular-nums">{money(marker.value)}</span>
                </span>
              </div>
            );
          })}
        </div>
        {totalCost != null || (p.minimumSellingPrice != null && target != null) ? (
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { key: "atTarget", value: totalCost != null && target != null ? target - totalCost : null },
              {
                key: "atMinimum",
                value: totalCost != null && p.minimumSellingPrice != null ? p.minimumSellingPrice - totalCost : null,
              },
              {
                key: "room",
                value: p.minimumSellingPrice != null && target != null ? Math.max(0, target - p.minimumSellingPrice) : null,
              },
            ].map((stat) => (
              <div key={stat.key} className="bg-muted/40 grid gap-1 rounded-xl p-3">
                <dt className="text-muted-foreground text-[11px] leading-tight font-medium tracking-wide uppercase">
                  {t(`pricing.visual.stats.${stat.key}`)}
                </dt>
                <dd
                  className={cn(
                    "font-heading text-sm font-semibold tabular-nums sm:text-base",
                    stat.value != null && stat.value < 0 && "text-destructive",
                    stat.value != null && stat.value > 0 && stat.key !== "room" && "text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {stat.value == null ? "—" : money(stat.value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {zones
            .filter((zone) => zone.key !== "premium")
            .map((zone) => (
              <li key={zone.key} className="flex items-center gap-1.5">
                <span className={cn(zone.cls, "size-3 rounded-sm")} aria-hidden />
                <span className="font-medium">{t(`pricing.visual.zones.${zone.key}`)}</span>
                <span className="text-muted-foreground">· {t(`pricing.visual.zoneHints.${zone.key}`)}</span>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ cost donut */

const DONUT_COLORS = ["var(--chart-2)", "var(--brand)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#38bdf8", "#a78bfa"];

export function CostMixCard({
  lines,
  total,
  currency,
}: {
  lines: { label: string; value: number }[];
  total: number | null;
  currency?: string;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const money = useMoney(currency);
  const parts = lines.filter((line) => line.value > 0);
  const sum = parts.reduce((acc, part) => acc + part.value, 0);
  if (sum <= 0) return null;
  const r = 42;
  // Where each slice starts around the ring (cumulative share of the slices before it).
  const slices = parts.map((part, index) => ({
    ...part,
    share: part.value / sum,
    start: parts.slice(0, index).reduce((acc, prev) => acc + prev.value / sum, 0),
  }));

  return (
    <Card className="animate-rise h-full [animation-delay:180ms]">
      <CardHeader>
        <ChartTitle icon={PieChartIcon}>{t("pricing.visual.costMixTitle")}</ChartTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="relative mx-auto size-40">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth="12" />
            {slices.map((slice, index) => (
              <circle
                key={slice.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                strokeWidth="12"
                pathLength={1}
                strokeDasharray={`${Math.max(slice.share - 0.006, 0.001)} 1`}
                strokeDashoffset={-slice.start}
                className="animate-fade-in"
                style={{ animationDelay: `${150 + index * 120}ms` }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              {t("pricing.summary.totalCost")}
            </span>
            <span className="font-heading text-xs font-semibold tabular-nums">{money(total ?? sum)}</span>
          </div>
        </div>
        <ul className="grid gap-2 text-sm">
          {parts.map((part, index) => (
            <li key={part.label} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} aria-hidden />
              <span className="text-muted-foreground min-w-0 flex-1 truncate">{part.label}</span>
              <span className="font-medium tabular-nums">{money(part.value)}</span>
              <span className="text-muted-foreground w-11 text-end text-xs tabular-nums">
                {formatPercent(part.value / sum, locale)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------- price history */

type Point = { at: number; target: number | null; minimum: number | null; anchor?: boolean };

/** Step chart of the target and minimum price over time, built from the change log. */
export function PriceHistoryChart({
  history,
  current,
  currency,
}: {
  history: VehiclePricingHistoryItem[];
  current: { target: number | null; minimum: number | null };
  currency?: string;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const money = useMoney(currency);

  // Chronological; carry values forward when a change only touched one of them.
  const points: Point[] = [];
  const ordered = [...history].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  let target: number | null = ordered[0]?.previousTargetPrice ?? null;
  let minimum: number | null = ordered[0]?.previousMinimumPrice ?? null;
  for (const item of ordered) {
    target = item.newTargetPrice ?? item.newCurrentPrice ?? target;
    minimum = item.newMinimumPrice ?? minimum;
    points.push({ at: new Date(item.changedAt).getTime(), target, minimum });
  }
  const last = points.at(-1);
  if (last && (current.target !== last.target || current.minimum !== last.minimum)) {
    points.push({ at: last.at, target: current.target ?? last.target, minimum: current.minimum ?? last.minimum });
  }

  const withTarget = points.filter((point) => point.target != null);
  // Extend the latest price to "now" so the newest change reads as a level, not a cliff at the edge.
  const tail = points.at(-1);
  if (tail) points.push({ ...tail, at: Math.max(tail.at, Date.parse(history[0]?.changedAt ?? "") || tail.at), anchor: true });
  const header = (
    <CardHeader>
      <ChartTitle icon={LineChartIcon}>{t("pricing.visual.historyTitle")}</ChartTitle>
      <CardDescription>{t("pricing.visual.historyHint")}</CardDescription>
    </CardHeader>
  );

  if (withTarget.length < 2) {
    return (
      <Card className="animate-rise h-full [animation-delay:240ms]">
        {header}
        <CardContent>
          <div className="text-muted-foreground grid h-44 place-content-center justify-items-center gap-2 rounded-xl border border-dashed text-center text-sm">
            <LineChartIcon className="size-6 opacity-60" aria-hidden />
            {t("pricing.visual.notEnoughHistory")}
          </div>
        </CardContent>
      </Card>
    );
  }

  const W = 600;
  const H = 180;
  const pad = 10;
  const all = points.flatMap((point) => [point.target, point.minimum]).filter((v): v is number => v != null);
  const vMax = Math.max(...all);
  const vMin = Math.min(...all);
  const range = vMax - vMin || vMax * 0.1 || 1;
  const yLo = vMin - range * 0.15;
  const yHi = vMax + range * 0.15;
  const n = points.length;
  // Even spacing per change keeps clustered edits readable.
  const x = (index: number) => (index / (n - 1)) * W;
  const y = (value: number) => H - pad - ((value - yLo) / (yHi - yLo)) * (H - pad * 2);
  const step = (key: "target" | "minimum") => {
    let d = "";
    points.forEach((point, index) => {
      const value = point[key];
      if (value == null) return;
      d += d === "" ? `M${x(index)},${y(value)}` : ` H${x(index)} V${y(value)}`;
    });
    return d;
  };
  const targetPath = step("target");
  const areaPath = `${targetPath} H${W} V${H} H0 Z`;
  const first = withTarget[0].target!;
  const latest = withTarget.at(-1)!.target!;
  const delta = latest - first;

  return (
    <Card className="animate-rise h-full [animation-delay:240ms]">
      {header}
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-heading text-2xl font-semibold tabular-nums">{money(latest)}</span>
          {delta !== 0 ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                delta > 0
                  ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
              )}
            >
              {delta > 0 ? <ArrowUpRightIcon className="size-3.5" aria-hidden /> : <ArrowDownRightIcon className="size-3.5" aria-hidden />}
              {delta > 0 ? "+" : "−"}
              {money(Math.abs(delta))} ({formatPercent(Math.abs(delta) / first, locale)})
            </span>
          ) : null}
        </div>
        <div className="relative h-44">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {[0, 1, 2, 3].map((line) => (
              <div key={line} className="border-border/70 border-t border-dashed" />
            ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible rtl:-scale-x-100"
            role="img"
            aria-label={t("pricing.visual.historyTitle")}
          >
            <defs>
              <linearGradient id="price-history-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#price-history-fill)" className="animate-fade-in [animation-delay:500ms]" />
            <path
              d={step("minimum")}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={targetPath}
              fill="none"
              stroke="var(--brand)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {points.map((point, index) =>
            point.target != null && !point.anchor ? (
              <span
                key={index}
                className="bg-card animate-pop absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--brand)] rtl:translate-x-1/2"
                style={{
                  insetInlineStart: `${(x(index) / W) * 100}%`,
                  top: `${(y(point.target) / H) * 100}%`,
                  animationDelay: `${300 + index * 60}ms`,
                }}
                title={`${formatDate(new Date(point.at).toISOString(), locale, "medium")} · ${money(point.target)}`}
              />
            ) : null,
          )}
        </div>
        <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
          <span>{formatDate(new Date(points[0].at).toISOString(), locale, "medium")}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[var(--brand)]" aria-hidden />
              {t("pricing.visual.markers.target")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-amber-500" aria-hidden />
              {t("pricing.visual.markers.minimum")}
            </span>
          </span>
          <span>{t("pricing.visual.now")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------- change timeline */

export function PriceChangeTimeline({
  history,
  currency,
}: {
  history: VehiclePricingHistoryItem[];
  currency?: string;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const money = useMoney(currency);

  const changes = (item: VehiclePricingHistoryItem) =>
    [
      { key: "target", label: t("pricing.visual.markers.target"), from: item.previousTargetPrice, to: item.newTargetPrice },
      { key: "minimum", label: t("pricing.visual.markers.minimum"), from: item.previousMinimumPrice, to: item.newMinimumPrice },
      { key: "advertised", label: t("pricing.visual.markers.advertised"), from: item.previousAdvertisedPrice, to: item.newAdvertisedPrice },
    ].filter((c) => c.from !== c.to && c.to != null);

  return (
    <Card className="animate-rise h-full [animation-delay:300ms]">
      <CardHeader>
        <ChartTitle icon={HistoryIcon}>{t("pricing.sections.history")}</ChartTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("pricing.visual.noChanges")}</p>
        ) : (
          <ol className="stagger relative grid gap-4 [--stagger:50ms]">
            <span className="bg-border absolute inset-y-2 start-[15px] w-0.5 rounded-full" aria-hidden />
            {history.slice(0, 8).map((item) => {
              const list = changes(item);
              const main = list[0];
              const up = main && main.from != null && main.to! > main.from;
              const down = main && main.from != null && main.to! < main.from;
              const Icon = up ? ArrowUpRightIcon : down ? ArrowDownRightIcon : main ? CarFrontIcon : MinusIcon;
              return (
                <li key={item.id} className="relative flex gap-3">
                  <span
                    className={cn(
                      "ring-card relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4",
                      up && "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300",
                      down && "bg-rose-500/12 text-rose-700 dark:text-rose-300",
                      !up && !down && "bg-brand-soft text-brand",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1.5 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-semibold">
                        {item.changedByName ?? t("pricing.history.unknownUser")}
                      </span>
                      <span className="text-muted-foreground text-xs" title={formatDate(item.changedAt, locale, "dateTime")}>
                        {formatRelativeTime(item.changedAt, locale)}
                      </span>
                    </div>
                    {list.map((change) => (
                      <p key={change.key} className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                        <span className="text-muted-foreground">{change.label}</span>
                        {change.from != null ? (
                          <>
                            <span className="text-muted-foreground line-through">{money(change.from)}</span>
                            <span aria-hidden>→</span>
                          </>
                        ) : null}
                        <span className="font-semibold">{money(change.to!)}</span>
                      </p>
                    ))}
                    {item.reason || item.notes ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.reason ? (
                          <span className="bg-muted rounded-full px-2 py-0.5 text-[11px] font-medium">
                            {t(`pricing.reasons.${item.reason}`)}
                          </span>
                        ) : null}
                        {item.notes ? <span className="text-muted-foreground text-xs">{item.notes}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
