import {
  CarIcon,
  HistoryIcon,
  LockIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import type { LandingCopy } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

type Copy = LandingCopy["trust"]["visual"];

const workspaces = [
  { initial: "A", figures: ["148", "412", "4.4M"] },
  { initial: "G", figures: ["63", "190", "1.9M"] },
] as const;
const rowIcons: LucideIcon[] = [CarIcon, UsersIcon, WalletIcon];

/**
 * Two dealerships' workspaces kept apart, above the audit log, drawn with the app's own
 * surfaces, gold accents and type. Sample figures; the whole thing is one labelled picture.
 */
export function TrustVisual({ copy, alt }: { copy: Copy; alt: string }) {
  const labels = [copy.cars, copy.customers, copy.sales];

  return (
    <div role="img" aria-label={alt} className="grid gap-3 p-3 sm:gap-4 sm:p-4">
      <div
        aria-hidden
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 sm:gap-3"
      >
        {workspaces.map((workspace, index) => (
          <div
            key={workspace.initial}
            className={cn(
              "border-sidebar-border bg-sidebar-accent/50 rounded-lg border p-3 sm:p-4",
              index === 1 && "col-start-3",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="bg-gold text-brand-foreground font-heading flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold sm:size-9">
                {workspace.initial}
              </span>
              <div className="min-w-0">
                <p className="font-heading truncate text-sm font-semibold sm:text-base">
                  {index === 0 ? copy.workspaceA : copy.workspaceB}
                </p>
                <p className="text-sidebar-primary flex items-center gap-1 text-[0.65rem] font-medium tracking-wide uppercase sm:text-xs">
                  <LockIcon className="size-3" />
                  {copy.private}
                </p>
              </div>
            </div>
            <ul className="mt-3 grid gap-1.5 sm:mt-4 sm:gap-2">
              {labels.map((label, row) => {
                const Icon = rowIcons[row];
                return (
                  <li
                    key={label}
                    className="border-sidebar-border/70 bg-sidebar flex items-center gap-2 rounded-md border px-2 py-1.5 sm:gap-2.5 sm:px-2.5 sm:py-2"
                  >
                    <span className="bg-sidebar-primary/15 text-sidebar-primary flex size-6 shrink-0 items-center justify-center rounded-md sm:size-7">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="text-sidebar-foreground/70 min-w-0 flex-1 truncate text-xs sm:text-sm">
                      {label}
                    </span>
                    <span
                      className="font-heading text-xs font-semibold tabular-nums sm:text-sm"
                      dir="ltr"
                    >
                      {row === 2 ? (
                        <span className="text-sidebar-foreground/50 me-0.5 text-[0.6rem] font-medium">
                          AED
                        </span>
                      ) : null}
                      {workspace.figures[row]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* The wall between them. */}
        <div className="relative col-start-2 row-start-1 flex w-8 flex-col items-center justify-center sm:w-10">
          <span className="via-sidebar-primary/60 absolute inset-y-2 start-1/2 w-px -translate-x-1/2 bg-linear-to-b from-transparent to-transparent rtl:translate-x-1/2" />
          <span className="bg-gold text-brand-foreground ring-sidebar relative flex size-8 items-center justify-center rounded-full shadow-[0_0_24px_color-mix(in_oklch,var(--sidebar-primary)_55%,transparent)] ring-4 sm:size-10">
            <LockIcon className="size-4 sm:size-5" />
          </span>
        </div>
      </div>

      <p aria-hidden className="text-sidebar-foreground/55 text-center text-xs">
        {copy.wall}
      </p>

      <div aria-hidden className="border-sidebar-border bg-sidebar-accent/50 rounded-lg border">
        <div className="border-sidebar-border flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <HistoryIcon className="text-sidebar-primary size-4" />
          <p className="font-heading text-sm font-semibold">{copy.audit}</p>
          <span className="text-sidebar-foreground/40 ms-auto text-[0.65rem]">{copy.sample}</span>
        </div>
        <ul className="divide-sidebar-border divide-y">
          {copy.rows.map((row) => (
            <li key={row.what} className="flex items-center gap-2.5 px-3 py-2 sm:px-4">
              <span className="font-heading text-sidebar-primary bg-sidebar ring-sidebar-primary/40 flex size-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ring-1">
                {row.who
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs sm:text-sm">
                  <span className="font-semibold">{row.who}</span>
                  <span className="text-sidebar-foreground/45"> · {row.role}</span>
                </p>
                <p className="text-sidebar-foreground/65 truncate text-xs">{row.what}</p>
              </div>
              <span className="text-sidebar-foreground/45 shrink-0 text-xs tabular-nums">
                {row.when}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
