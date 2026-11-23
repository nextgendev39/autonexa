"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FormStepperStep } from "@/components/forms/form-stepper";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Compact one-line header for full-screen step forms: close, title and the steps.
 * Phones show "Step 2 of 4 · Acquisition" with a segmented progress bar instead of labels.
 */
export function FormStepBar({
  title,
  subtitle,
  closeHref,
  closeLabel,
  steps,
  currentId,
  onStepSelect,
}: {
  title: string;
  subtitle?: string;
  closeHref: string;
  closeLabel: string;
  steps: FormStepperStep[];
  currentId: string;
  /** Allow jumping back to earlier steps only. */
  onStepSelect?: (id: string) => void;
}) {
  const t = useTranslations("inventory.stepper");
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentId),
  );
  const current = steps[currentIndex];

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ms-1.5 shrink-0"
          nativeButton={false}
          render={<Link href={closeHref} />}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <XIcon />
        </Button>
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="font-heading truncate text-base leading-tight font-semibold tracking-tight">
            {title}
            {subtitle ? (
              <span className="text-muted-foreground ms-2 font-mono text-xs font-normal">
                {subtitle}
              </span>
            ) : null}
          </h1>
          <p className="text-muted-foreground truncate text-xs md:hidden">
            {t("progress", { current: currentIndex + 1, total: steps.length })} · {current?.label}
            {current?.optional ? ` · ${t("optional")}` : null}
          </p>
        </div>

        <ol
          className="ms-auto hidden min-w-0 items-stretch gap-2 md:flex"
          aria-label={t("navLabel")}
        >
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            const clickable = Boolean(onStepSelect) && index < currentIndex;
            return (
              <li key={step.id} className="w-24 min-w-0 lg:w-32">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onStepSelect?.(step.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group/step focus-visible:ring-ring grid w-full gap-1.5 rounded-md pt-1 text-start outline-none focus-visible:ring-2",
                    clickable ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "h-0.5 w-full rounded-full transition-colors duration-200",
                      done || active ? "bg-brand" : "bg-border",
                      clickable && "group-hover/step:bg-brand/70",
                    )}
                    aria-hidden
                  />
                  <span className="flex min-w-0 items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        "font-mono text-[10px] tabular-nums",
                        active || done ? "text-brand" : "text-subtle-foreground",
                      )}
                    >
                      {done ? (
                        <CheckIcon className="size-3" aria-hidden />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <span
                      className={cn(
                        "truncate",
                        active
                          ? "text-foreground font-semibold"
                          : done
                            ? "text-foreground/80"
                            : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex gap-1 md:hidden" aria-hidden>
        {steps.map((step, index) => (
          <span
            key={step.id}
            className={cn(
              "h-0.5 flex-1 rounded-full transition-colors duration-200",
              index < currentIndex ? "bg-brand" : index === currentIndex ? "bg-brand" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}
