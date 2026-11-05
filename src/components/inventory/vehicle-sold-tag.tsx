"use client";

import { BadgeCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";

/** A light sweeping across the tag; hidden for people who prefer less motion. */
export function Sheen() {
  return (
    <span
      className="animate-sheen pointer-events-none absolute inset-y-0 start-0 w-1/3 bg-linear-to-r from-transparent via-white/35 to-transparent motion-reduce:hidden"
      aria-hidden
    />
  );
}

/** "Sold" pill for the vehicle page header, with the sale date when known. */
export function SoldTag({ soldAt, className }: { soldAt?: string | null; className?: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <span
      className={cn(
        "animate-pop relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full ps-1.5 pe-4 md:h-9",
        "bg-carbon ring-brand/50 shadow-md ring-1 shadow-black/20",
        className,
      )}
    >
      <Sheen />
      <span className="bg-gold text-brand-foreground flex size-7 items-center justify-center rounded-full md:size-6">
        <BadgeCheckIcon className="size-4" aria-hidden />
      </span>
      <span className="grid leading-none">
        <span className="text-gold text-[13px] font-semibold tracking-[0.12em] uppercase">
          {t("inventory.status.sold")}
        </span>
        {soldAt ? (
          <span className="text-sidebar-foreground/70 mt-0.5 text-[10px] font-medium">
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

/** Corner ribbon across a sold vehicle's photo. */
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
          "bg-carbon border-brand/70 overflow-hidden border-y text-center leading-tight font-bold uppercase shadow-lg",
          style.band,
        )}
      >
        <Sheen />
        <span className="text-gold">{t("inventory.status.sold")}</span>
      </div>
    </div>
  );
}

/**
 * "Ready for sale" over the vehicle's main photo: frosted dark glass with a glowing
 * gold live dot, matching the New badge's size.
 */
export function ReadyForSaleTag({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        "animate-pop relative inline-flex h-8 items-center gap-2 overflow-hidden rounded-full ps-3 pe-3.5",
        "bg-black/45 shadow-lg ring-1 shadow-black/30 ring-white/20 backdrop-blur-md",
        className,
      )}
    >
      {/* Gold hairline along the top edge catches the light like the badge's rim. */}
      <span
        className="via-brand/80 pointer-events-none absolute inset-x-3 top-0 h-px bg-linear-to-r from-transparent to-transparent"
        aria-hidden
      />
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span className="animate-ping-soft bg-brand absolute inset-0 rounded-full motion-reduce:hidden" />
        <span className="bg-brand relative size-2 rounded-full shadow-[0_0_10px_var(--brand)]" />
      </span>
      <span className="text-[11px] font-semibold tracking-[0.16em] text-white uppercase">
        {t("inventory.status.ready_for_sale")}
      </span>
    </span>
  );
}
