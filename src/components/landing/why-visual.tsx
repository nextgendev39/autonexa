import {
  ArrowDownIcon,
  CalendarClockIcon,
  FileSpreadsheetIcon,
  MapPinIcon,
  MessageCircleIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import { VehiclePhotoPlaceholder } from "@/components/inventory/vehicle-photo-placeholder";
import type { LandingCopy } from "@/components/landing/motion";
import { StatusBadge } from "@/components/shared/status-badge";

type Copy = LandingCopy["why"]["visual"];

const sourceIcons: LucideIcon[] = [FileSpreadsheetIcon, MessageCircleIcon, ReceiptTextIcon];
const factIcons: LucideIcon[] = [MapPinIcon, WalletIcon, CalendarClockIcon, TrendingUpIcon];

/**
 * Where a dealership's facts live today, and the one AutoNexa record that replaces them, drawn
 * with the app's own card, badge and photo placeholder. Follows the page theme.
 */
export function WhyVisual({ copy, alt }: { copy: Copy; alt: string }) {
  return (
    <div role="img" aria-label={alt} className="grid grid-cols-1 gap-3 p-3 sm:p-4">
      <div aria-hidden>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
          {copy.before}
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5">
          {copy.sources.map((source, index) => {
            const Icon = sourceIcons[index % sourceIcons.length];
            return (
              <li
                key={source.name}
                className="border-border bg-muted/50 flex items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2"
              >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm line-through decoration-[color-mix(in_oklch,var(--destructive)_55%,transparent)]">
                  {source.name}
                </span>
                <span className="text-destructive/80 shrink-0 text-xs">{source.question}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div aria-hidden className="flex justify-center">
        <span className="bg-gold text-brand-foreground flex size-8 items-center justify-center rounded-full shadow-md">
          <ArrowDownIcon className="size-4" />
        </span>
      </div>

      <div aria-hidden>
        <p className="text-brand-strong dark:text-brand text-xs font-semibold tracking-[0.14em] uppercase">
          {copy.after}
        </p>
        <div className="border-border bg-card mt-2 overflow-hidden rounded-lg border shadow-sm">
          <div className="aspect-[16/7]">
            <VehiclePhotoPlaceholder size="sm" />
          </div>
          <div className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-heading truncate text-base font-semibold">{copy.car}</p>
                <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                  AN-01042
                </p>
              </div>
              <StatusBadge status="reserved" label={copy.status} />
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-1.5">
              {copy.facts.map((fact, index) => {
                const Icon = factIcons[index % factIcons.length];
                const last = index === copy.facts.length - 1;
                return (
                  <div
                    key={fact.label}
                    className="bg-muted/60 flex items-center gap-2.5 rounded-md px-2.5 py-2"
                  >
                    <span className="bg-brand-soft text-brand-strong dark:text-brand flex size-6 shrink-0 items-center justify-center rounded-md">
                      <Icon className="size-3.5" />
                    </span>
                    <dt className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                      {fact.label}
                    </dt>
                    <dd
                      className={
                        last
                          ? "font-heading text-brand-strong dark:text-brand text-sm font-semibold"
                          : "text-sm font-medium"
                      }
                    >
                      {fact.value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
