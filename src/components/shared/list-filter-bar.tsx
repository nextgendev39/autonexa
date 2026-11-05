"use client";

import { ListFilterIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FilterChip, FilterToolbar } from "@/components/shared/filter-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type FilterChipItem = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

/**
 * Compact list toolbar: search, basic filters, a Filters button (side sheet) and optional
 * actions (e.g. List/Grid). On phones only search and Filters stay in the bar; the basic
 * filters move to the top of the sheet and the button counts every active filter.
 */
export function ListFilterBar({
  ariaLabel,
  search,
  basicFilters,
  basicCount = 0,
  chips,
  advancedCount,
  hasActiveFilters,
  onClear,
  drawerTitle,
  drawerDescription,
  drawerContent,
  actions,
  className,
}: {
  ariaLabel: string;
  /** The search box; stays in the bar on every screen size. */
  search: React.ReactNode;
  basicFilters: React.ReactNode;
  /** How many of the basic filters are set (shown on the phone Filters button). */
  basicCount?: number;
  chips: FilterChipItem[];
  advancedCount: number;
  hasActiveFilters: boolean;
  onClear: () => void;
  drawerTitle: string;
  drawerDescription?: string;
  drawerContent: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);

  const mobileCount = advancedCount + basicCount;

  return (
    <section
      className={cn("md:bg-card flex flex-col gap-3 md:rounded-xl md:border md:p-4", className)}
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-2 md:gap-3 lg:flex-row">
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
          <div className="min-w-0 md:col-span-2 xl:col-span-1">{search}</div>
          <div className="hidden md:contents">{basicFilters}</div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="relative h-11 gap-1.5 px-3 md:h-10"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <ListFilterIcon className="size-4" aria-hidden />
            <span className="sr-only md:not-sr-only">{t("filters")}</span>
            {mobileCount > 0 ? (
              <span className="bg-brand text-brand-foreground absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums md:hidden">
                {mobileCount}
              </span>
            ) : null}
            {advancedCount > 0 ? (
              <Badge variant="secondary" className="ms-0.5 hidden tabular-nums md:inline-flex">
                {advancedCount}
              </Badge>
            ) : null}
          </Button>
          {actions}
        </div>
      </div>

      {chips.length > 0 ? (
        <FilterToolbar>
          {/* Phones scroll the chips sideways instead of stacking rows. */}
          <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
            {chips.map((chip) => (
              <FilterChip
                key={chip.key}
                label={chip.label}
                value={chip.value}
                onRemove={chip.onRemove}
              />
            ))}
          </div>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0"
              onClick={onClear}
            >
              <XIcon aria-hidden />
              {t("clearAll")}
            </Button>
          ) : null}
        </FilterToolbar>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden p-0 sm:max-w-md"
          showCloseButton
        >
          <SheetHeader className="border-b pe-12">
            <SheetTitle>{drawerTitle}</SheetTitle>
            {drawerDescription ? (
              <SheetDescription className="text-xs">{drawerDescription}</SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="bg-muted/20 min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {/* On phones the basic filters live here, above the grouped ones. */}
            <div className="bg-card mb-2.5 grid gap-2.5 rounded-xl border p-3 md:hidden">
              {basicFilters}
            </div>
            {drawerContent}
          </div>
          <SheetFooter className="bg-background border-t sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" disabled={!hasActiveFilters} onClick={onClear}>
              {t("clearAll")}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              {t("done")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
