"use client";

import { useTranslations } from "next-intl";

import { splitMinutes } from "@/lib/validation/payment-terms";

/** "2 days 3 hours" / "45 minutes" in the viewer's language. */
export function useFormatDuration() {
  const t = useTranslations("duration");
  return (totalMinutes: number) => {
    const { days, hours, minutes } = splitMinutes(Math.max(0, Math.round(totalMinutes)));
    const parts = [
      days > 0 ? t("days", { count: days }) : null,
      hours > 0 ? t("hours", { count: hours }) : null,
      minutes > 0 ? t("minutes", { count: minutes }) : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : t("minutes", { count: 0 });
  };
}
