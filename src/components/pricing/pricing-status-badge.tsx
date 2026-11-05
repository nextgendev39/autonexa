"use client";

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/status-badge";
import type { PricingStatus } from "@/types/pricing";

export function PricingStatusBadge({ status }: { status: PricingStatus }) {
  const t = useTranslations();
  return <StatusBadge status={status} label={t(`pricing.status.${status}`)} />;
}
