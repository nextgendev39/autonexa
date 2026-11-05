"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type FormStepperStep = {
  id: string;
  label: string;
  description?: string;
  optional?: boolean;
};

export function FormStepper({
  steps,
  currentId,
  onStepSelect,
}: {
  steps: FormStepperStep[];
  currentId: string;
  /** Allow jumping back to earlier steps only. */
  onStepSelect?: (id: string) => void;
}) {
  const t = useTranslations();
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentId),
  );
  const current = steps[currentIndex] ?? steps[0];

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("inventory.stepper.progress", {
              current: currentIndex + 1,
              total: steps.length,
            })}
          </p>
          <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
            {current?.label}
          </h2>
          {current?.description ? (
            <p className="text-muted-foreground mt-0.5 text-sm">{current.description}</p>
          ) : null}
        </div>
        {current?.optional ? (
          <span className="text-muted-foreground shrink-0 rounded-full border px-2.5 py-1 text-xs">
            {t("inventory.stepper.optional")}
          </span>
        ) : null}
      </div>

      <ol className="flex items-center gap-1 sm:gap-2" aria-label={t("inventory.stepper.navLabel")}>
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const clickable = Boolean(onStepSelect) && index < currentIndex;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStepSelect?.(step.id)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg p-1 transition-colors",
                  clickable && "hover:bg-muted/60 cursor-pointer",
                  !clickable && "cursor-default",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors sm:size-9 sm:text-sm",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-primary/10 text-primary",
                    !done && !active && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {done ? <CheckIcon className="size-4" aria-hidden /> : index + 1}
                </span>
                <span
                  className={cn(
                    "hidden max-w-full truncate text-center text-[11px] font-medium sm:block",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "mb-5 hidden h-px flex-1 sm:block",
                    index < currentIndex ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
