"use client";

import { BadgeCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";

/** A static top highlight that gives premium tags a soft metallic finish (no motion). */
export function Sheen() {
  return (
    <span
      className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/12 to-transparent"
      aria-hidden
    />
  );
}

/** "Sold" pill for the vehicle page header (blue: the shared sold tone), with the sale date. */
export function SoldTag({ soldAt, className }: { soldAt?: string | null; className?: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <span
      className={cn(
        "border-info/30 bg-info-soft text-info-foreground inline-flex h-10 items-center gap-2 rounded-full border ps-1.5 pe-4 md:h-9",
        className,
      )}
    >
      <span className="bg-info flex size-7 items-center justify-center rounded-full text-white md:size-6">
        <BadgeCheckIcon className="size-4" aria-hidden />
      </span>
      <span className="grid leading-none">
        <span className="text-[13px] font-semibold">{t("inventory.status.sold")}</span>
        {soldAt ? (
          <span className="mt-0.5 text-[10px] font-medium opacity-75">
            {t("inventory.booking.soldOn")} {formatDate(soldAt, locale, "medium")}
          </span>
        ) : null}
      </span>
    </span>
  );
}

const RIBBON = {
  /** Vehicle page photo. */
  lg: { box: "size-32", band: "-end-10 top-6 w-44 py-1.5 text-xs tracking-[0.3em]" },
  /** Grid card photo. */
  md: { box: "size-24", band: "-end-8 top-4 w-32 py-1 text-[10px] tracking-[0.25em]" },
  /** Compact phone card photo. */
  sm: { box: "size-16", band: "-end-6 top-2.5 w-24 py-0.5 text-[8px] tracking-[0.2em]" },
} as const;

/** Corner ribbon across a sold vehicle's photo, in the shared sold blue. */
export function SoldRibbon({ size = "lg" }: { size?: keyof typeof RIBBON }) {
  const t = useTranslations();
  const style = RIBBON[size];
  return (
    <div
      className={cn("pointer-events-none absolute end-0 top-0 overflow-hidden", style.box)}
      aria-hidden
    >
      <div
        className={cn(
          "absolute rotate-45 rtl:-rotate-45",
          "overflow-hidden bg-[#3d6f95] text-center leading-tight font-bold text-white uppercase shadow-md",
          style.band,
        )}
      >
        {t("inventory.status.sold")}
      </div>
    </div>
  );
}

/** "Ready for sale" over the vehicle's main photo: frosted dark glass with a green dot. */
export function ReadyForSaleTag({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full ps-3 pe-3.5",
        "bg-[#111318]/70 shadow-md ring-1 ring-white/15 backdrop-blur-md",
        className,
      )}
    >
      <span className="size-2 shrink-0 rounded-full bg-[#3fa877]" aria-hidden />
      <span className="text-[11px] font-semibold tracking-[0.12em] text-white uppercase">
        {t("inventory.status.ready_for_sale")}
      </span>
    </span>
  );
}
