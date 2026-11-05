"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-14 text-center">
      <span className="bg-destructive/10 text-destructive mb-4 flex size-11 items-center justify-center rounded-full">
        <TriangleAlertIcon className="size-5" aria-hidden />
      </span>
      <h2 className="text-base font-medium">{t("errors.title")}</h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">{t("errors.description")}</p>
      {onRetry ? (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
