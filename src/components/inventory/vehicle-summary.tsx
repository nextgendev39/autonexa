"use client";

import { CarIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { StockPipelineSkeleton } from "@/components/feedback/skeletons";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/utils/currency";
import type { InventorySummary } from "@/types/vehicle";

/** Stock at a glance: a compact card on phones, the pipeline card with the total elsewhere. */
export function VehicleSummary({ summary }: { summary?: InventorySummary }) {
  return (
    <>
      <CompactSummary summary={summary} />
      <div className="hidden md:block">
        {summary ? <StockPipeline summary={summary} /> : <StockPipelineSkeleton />}
      </div>
    </>
  );
}

const pipelineSegments = [
  { key: "inTransit", color: "bg-sky-500" },
  { key: "readyForSale", color: "bg-emerald-500" },
  { key: "reserved", color: "bg-amber-500" },
  { key: "sold", color: "bg-violet-500" },
] as const;

/** Phone layout: total, the segmented bar and the four statuses in a single row. */
function CompactSummary({ summary }: { summary?: InventorySummary }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const share = (value: number) => (summary?.total ? value / summary.total : 0);

  return (
    <Card size="sm" className="animate-rise gap-3 px-3.5 py-3 md:hidden">
      <div className="flex items-center gap-2.5">
        <span
          className="bg-muted text-foreground/70 flex size-8 shrink-0 items-center justify-center rounded-lg"
          aria-hidden
        >
          <CarIcon className="size-4" />
        </span>
        <p className="text-muted-foreground text-xs font-medium">{t("inventory.summary.total")}</p>
        {summary ? (
          <p className="font-heading ms-auto text-xl font-semibold tabular-nums">
            {formatNumber(summary.total, locale)}
          </p>
        ) : (
          <Skeleton className="ms-auto h-6 w-12" />
        )}
      </div>

      <div
        className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={
          summary
            ? pipelineSegments
                .map((segment) => `${t(`inventory.summary.${segment.key}`)} ${summary[segment.key]}`)
                .join(", ")
            : undefined
        }
      >
        {summary
          ? pipelineSegments.map((segment) =>
              summary[segment.key] > 0 ? (
                <div
                  key={segment.key}
                  className={cn(
                    segment.color,
                    "animate-grow-x h-full first:rounded-s-full last:rounded-e-full ltr:origin-left rtl:origin-right",
                  )}
                  style={{ width: `${share(summary[segment.key]) * 100}%` }}
                />
              ) : null,
            )
          : null}
      </div>

      <ul className="grid grid-cols-4 divide-x rtl:divide-x-reverse">
        {pipelineSegments.map((segment) => (
          <li key={segment.key} className="grid min-w-0 justify-items-center gap-0.5 px-1 text-center">
            {summary ? (
              <span className="flex items-center gap-1 text-base font-semibold tabular-nums">
                <span className={cn(segment.color, "size-2 shrink-0 rounded-full")} aria-hidden />
                {formatNumber(summary[segment.key], locale)}
              </span>
            ) : (
              <Skeleton className="h-5 w-8" />
            )}
            <span className="text-muted-foreground line-clamp-2 text-[11px] leading-tight">
              {t(`inventory.summary.${segment.key}`)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Where the units are, as one segmented bar, plus how much of the stock has sold. */
function StockPipeline({ summary }: { summary: InventorySummary }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const share = (value: number) => (summary.total ? value / summary.total : 0);
  const sellThrough = share(summary.sold);
  const r = 15.9155; // circumference 100

  return (
    <Card className="animate-rise grid gap-5 p-4 [animation-delay:350ms] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading font-semibold">{t("inventory.pipeline.title")}</p>
            <p className="text-muted-foreground text-xs">{t("inventory.pipeline.hint")}</p>
          </div>
          <div className="bg-muted/60 flex shrink-0 items-center gap-2.5 rounded-lg py-1.5 ps-1.5 pe-3">
            <span
              className="bg-background text-foreground/70 flex size-7 items-center justify-center rounded-md shadow-xs"
              aria-hidden
            >
              <CarIcon className="size-4" />
            </span>
            <span className="text-muted-foreground text-xs font-medium">
              {t("inventory.summary.total")}
            </span>
            <span className="font-heading text-xl font-semibold tabular-nums">
              {formatNumber(summary.total, locale)}
            </span>
          </div>
        </div>
        <div
          className="bg-muted flex h-4 gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={pipelineSegments
            .map((segment) => `${t(`inventory.summary.${segment.key}`)} ${summary[segment.key]}`)
            .join(", ")}
        >
          {pipelineSegments.map((segment, index) =>
            summary[segment.key] > 0 ? (
              <div
                key={segment.key}
                className={cn(
                  segment.color,
                  "animate-grow-x h-full first:rounded-s-full last:rounded-e-full ltr:origin-left rtl:origin-right",
                )}
                style={{
                  width: `${share(summary[segment.key]) * 100}%`,
                  animationDelay: `${450 + index * 120}ms`,
                }}
              />
            ) : null,
          )}
        </div>
        <ul className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {pipelineSegments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-2">
              <span className={cn(segment.color, "size-2.5 shrink-0 rounded-full")} aria-hidden />
              <span className="text-muted-foreground truncate">
                {t(`inventory.summary.${segment.key}`)}
              </span>
              <span className="ms-auto font-semibold tabular-nums">
                {formatNumber(summary[segment.key], locale)}
              </span>
              <span className="text-muted-foreground w-10 text-end text-xs tabular-nums">
                {formatPercent(share(summary[segment.key]), locale)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-3 sm:border-s sm:ps-5">
        <div className="relative size-16 shrink-0">
          <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r={r} fill="none" className="stroke-muted" strokeWidth="3.5" />
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="none"
              pathLength={1}
              strokeDasharray={`${Math.max(sellThrough, 0.01)} 1`}
              strokeWidth="3.5"
              strokeLinecap="round"
              className="animate-draw stroke-violet-500"
              style={{ animationDelay: "600ms" }}
            />
          </svg>
          <span className="absolute inset-0 grid place-content-center text-xs font-semibold tabular-nums">
            {formatPercent(sellThrough, locale)}
          </span>
        </div>
        <div className="grid gap-0.5">
          <span className="text-sm font-semibold">{t("inventory.pipeline.sellThrough")}</span>
          <span className="text-muted-foreground text-xs">
            {t("inventory.pipeline.available")}:{" "}
            <span className="text-foreground font-medium tabular-nums">
              {formatNumber(summary.readyForSale, locale)}
            </span>
          </span>
        </div>
      </div>
    </Card>
  );
}
