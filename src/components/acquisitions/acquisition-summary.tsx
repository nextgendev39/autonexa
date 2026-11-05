"use client";

import { useTranslations } from "next-intl";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { KpiCard } from "@/components/cards/kpi-card";
import { KpiCardSkeleton } from "@/components/feedback/skeletons";
import { formatNumber } from "@/lib/utils/currency";
import type { AcquisitionSummary as Summary } from "@/types/acquisition";

const summaryKeys = [
  "total",
  "draft",
  "pendingApproval",
  "approved",
  "purchased",
  "documentsPending",
  "received",
  "cancelled",
] as const satisfies readonly (keyof Summary)[];

export function AcquisitionSummary({ summary }: { summary?: Summary }) {
  const t = useTranslations();
  const locale = useAppLocale();

  return (
    <section
      className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"
      aria-label={t("acquisitions.summary.total")}
    >
      {summaryKeys.map((key) =>
        summary ? (
          <KpiCard
            key={key}
            label={t(`acquisitions.summary.${key}`)}
            value={formatNumber(summary[key], locale)}
          />
        ) : (
          <KpiCardSkeleton key={key} />
        ),
      )}
    </section>
  );
}
