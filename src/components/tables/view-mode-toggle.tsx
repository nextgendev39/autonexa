"use client";

import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ListViewMode } from "@/hooks/use-list-view-mode";

export function ViewModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: ListViewMode;
  onChange: (mode: ListViewMode) => void;
  className?: string;
}) {
  const t = useTranslations("common");

  return (
    <div
      className={cn(
        // Phones always get the grid, so the switch only shows from tablets up.
        "bg-muted/50 hidden items-center gap-0.5 rounded-lg border p-0.5 md:inline-flex",
        className,
      )}
      role="group"
      aria-label={t("viewMode")}
    >
      <Button
        type="button"
        size="sm"
        variant={mode === "list" ? "secondary" : "ghost"}
        className="h-8 gap-1.5 px-2.5"
        aria-pressed={mode === "list"}
        onClick={() => onChange("list")}
      >
        <ListIcon className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t("listView")}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "grid" ? "secondary" : "ghost"}
        className="h-8 gap-1.5 px-2.5"
        aria-pressed={mode === "grid"}
        onClick={() => onChange("grid")}
      >
        <LayoutGridIcon className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t("gridView")}</span>
      </Button>
    </div>
  );
}
