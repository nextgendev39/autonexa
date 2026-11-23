"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/** Something failed to load: the empty-state panel with a red medallion and a retry. */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations();

  return (
    <div className="gradient-card rounded-panel flex w-full flex-col items-center justify-center border px-6 py-16 text-center shadow-sm">
      <span className="bg-card ring-border relative mb-5 flex size-16 items-center justify-center rounded-full shadow-sm ring-1">
        <span className="ring-destructive/25 absolute inset-1.5 rounded-full ring-1" aria-hidden />
        <TriangleAlertIcon className="text-destructive size-6" aria-hidden />
      </span>
      <h2 className="font-heading text-base font-semibold tracking-[-0.015em]">
        {t("errors.title")}
      </h2>
      <p className="text-muted-foreground mt-1.5 max-w-md text-sm">{t("errors.description")}</p>
      {onRetry ? (
        <Button className="mt-6" variant="outline" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
