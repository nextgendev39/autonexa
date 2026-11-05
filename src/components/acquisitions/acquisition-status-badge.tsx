"use client";

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/status-badge";
import type { AcquisitionStatus } from "@/types/acquisition";

export function AcquisitionStatusBadge({ status }: { status: AcquisitionStatus }) {
  const t = useTranslations();
  return <StatusBadge status={status} label={t(`acquisitions.status.${status}`)} />;
}
