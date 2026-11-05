"use client";

import {
  BadgePercentIcon,
  CheckIcon,
  PencilLineIcon,
  TargetIcon,
  ShieldAlertIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { PricingForm } from "@/components/pricing/pricing-form";
import { PricingStatusBadge } from "@/components/pricing/pricing-status-badge";
import {
  CostMixCard,
  PriceChangeTimeline,
  PriceCorridor,
  PriceHistoryChart,
  PricingKpis,
} from "@/components/pricing/pricing-visuals";
import { KpiCard } from "@/components/cards/kpi-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingPanelSkeleton } from "@/components/feedback/skeletons";
import { usePermission } from "@/hooks/use-permission";
import { usePricingMutations, useVehiclePricing } from "@/hooks/use-pricing";
import { seesSalesPricingOnly } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import type { VehicleProfitability } from "@/types/pricing";
import { toast } from "sonner";

export function VehiclePricingPanel({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations();
  const { can, user } = usePermission();
  const canView = can("pricing.view") || can("vehicle.price.view") || can("vehicle.profit.view");
  const canEdit = can("pricing.update") || can("pricing.create") || can("vehicle.price.edit");
  const canApprove = can("pricing.approve") || can("pricing.discount.approve");
  const canCost = can("vehicle.cost.view") || can("pricing.view");
  const canProfit = can("vehicle.profit.view") || can("pricing.view");
  // Sales executives see just what they negotiate with: the target price and maximum discount.
  const salesView = seesSalesPricingOnly(user.roles, can);

  const query = useVehiclePricing(vehicleId, canView);
  const { approve } = usePricingMutations(vehicleId);

  if (!canView) {
    return (
      <EmptyState
        title={t("pricing.restricted.title")}
        description={t("pricing.restricted.description")}
      />
    );
  }

  if (query.isPending) return <PricingPanelSkeleton />;
  if (query.isError || !query.data) {
    return (
      <EmptyState
        title={t("pricing.empty.loadFailed")}
        description={t("pricing.empty.loadFailedHint")}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const detail = query.data;
  const p = detail.profitability;
  if (salesView) return <SalesPricingView p={p} />;
  const breakdown = detail.breakdown;
  const purchaseCost = breakdown?.purchaseCost ?? p.purchaseCost;
  const acquisitionExpenses = breakdown?.acquisitionExpenses ?? p.acquisitionExpenses;
  const otherCosts = breakdown?.otherCosts ?? p.otherVehicleCosts;
  const totalVehicleCost = breakdown?.totalVehicleCost ?? p.totalVehicleCost;
  const acquisitionLines = breakdown?.acquisitionLines ?? [];
  const awaitingApproval =
    p.pricingStatus === "pending_approval" ||
    p.pricingStatus === "discount_approval_required" ||
    p.pricingStatus === "below_minimum";

  function expenseLabel(category: string) {
    const key = `acquisitions.expenseTypes.${category}`;
    return t.has(key) ? t(key) : category;
  }

  async function onApprove(approveFlag: boolean) {
    try {
      await approve.mutateAsync({ approve: approveFlag, note: null });
      toast.success(approveFlag ? t("pricing.toasts.approved") : t("pricing.toasts.rejected"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pricing.toasts.error"));
    }
  }

  const costLines = [
    { label: t("pricing.cost.purchase"), value: purchaseCost ?? 0 },
    ...(acquisitionLines.length > 0
      ? acquisitionLines.map((line) => ({ label: expenseLabel(line.category), value: line.amount }))
      : [{ label: t("pricing.cost.acquisitionExpenses"), value: acquisitionExpenses ?? 0 }]),
    { label: t("pricing.cost.workshop"), value: breakdown?.workshopCost ?? p.workshopCost ?? 0 },
    { label: t("pricing.cost.other"), value: otherCosts ?? 0 },
  ];
  const canHistory = can("pricing.history.view") || can("pricing.view");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-base font-semibold">{t("pricing.panel.title")}</h2>
          {p.pricingStatus ? <PricingStatusBadge status={p.pricingStatus} /> : null}
        </div>
      </div>

      {p.belowMinimum ? (
        <Alert variant="destructive" className="animate-rise">
          <TriangleAlertIcon />
          <AlertTitle>{t("pricing.warnings.belowMinimumTitle")}</AlertTitle>
          <AlertDescription>{t("pricing.warnings.belowMinimumBody")}</AlertDescription>
        </Alert>
      ) : null}

      {p.isLoss ? (
        <Alert className="animate-rise border-amber-500/40 bg-amber-500/10">
          <TrendingDownIcon />
          <AlertTitle>{t("pricing.warnings.lossTitle")}</AlertTitle>
          <AlertDescription>{t("pricing.warnings.lossBody")}</AlertDescription>
        </Alert>
      ) : null}

      <PricingKpis
        p={p}
        totalCost={canCost ? totalVehicleCost : null}
        canCost={canCost}
        canProfit={canProfit}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn(canCost ? "lg:col-span-2" : "lg:col-span-3")}>
          <PriceCorridor p={p} totalCost={canCost ? totalVehicleCost : null} />
        </div>
        {canCost ? (
          <CostMixCard lines={costLines} total={totalVehicleCost} currency={p.currency} />
        ) : null}
      </div>

      {awaitingApproval && canApprove ? (
        <Card className="animate-rise border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <ShieldAlertIcon className="size-4" aria-hidden />
              </span>
              {t("pricing.sections.approval")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="brand"
              onClick={() => void onApprove(true)}
              disabled={approve.isPending}
            >
              <CheckIcon />
              {t("pricing.actions.approve")}
            </Button>
            <Button
              variant="outline"
              onClick={() => void onApprove(false)}
              disabled={approve.isPending}
            >
              <XIcon />
              {t("pricing.actions.reject")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canHistory ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PriceHistoryChart
              history={detail.history}
              current={{
                target: p.targetSellingPrice ?? p.currentSellingPrice,
                minimum: p.minimumSellingPrice,
              }}
              currency={p.currency}
            />
          </div>
          <div className="lg:col-span-2">
            <PriceChangeTimeline history={detail.history} currency={p.currency} />
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <Card className="animate-rise [animation-delay:360ms]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span className="bg-brand-soft text-brand flex size-8 items-center justify-center rounded-lg">
                <PencilLineIcon className="size-4" aria-hidden />
              </span>
              {t("pricing.sections.edit")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PricingForm detail={detail} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SalesPricingView({ p }: { p: VehicleProfitability }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const money = (value: number | null) =>
    value == null ? "—" : formatCurrency(value, locale, p.currency);
  const percent =
    p.maximumDiscountPercent != null && p.maximumDiscountPercent > 0
      ? formatPercent(p.maximumDiscountPercent / 100, locale)
      : undefined;
  return (
    <div className="grid gap-4">
      <h2 className="font-heading text-base font-semibold">{t("pricing.salesView.title")}</h2>
      <section className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label={t("pricing.fields.target")}
          value={money(p.targetSellingPrice)}
          hint={p.targetSellingPrice == null ? t("pricing.salesView.notSet") : undefined}
          icon={TargetIcon}
          tone="brand"
        />
        <KpiCard
          label={t("pricing.salesView.maxDiscount")}
          value={money(p.maximumDiscountAmount)}
          hint={
            p.maximumDiscountAmount == null
              ? t("pricing.salesView.notSet")
              : percent
                ? t("pricing.salesView.maxDiscountHint", { percent })
                : undefined
          }
          icon={BadgePercentIcon}
          tone="warning"
        />
      </section>
    </div>
  );
}
