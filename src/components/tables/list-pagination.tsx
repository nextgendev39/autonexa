"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/inventory/native-select";
import { Spinner } from "@/components/shared/spinner";
import { Button } from "@/components/ui/button";

const PAGE_SIZES: readonly number[] = [25, 50, 100];

/**
 * Footer for paginated list pages. `namespace` is the module's message
 * namespace (e.g. "inventory"); it must define `pagination.*` and `actions.loading`.
 */
export function ListPagination({
  namespace,
  page,
  pageSize,
  total,
  fetching,
  pageSizes = PAGE_SIZES,
  onChange,
}: {
  namespace: string;
  page: number;
  pageSize: number;
  total: number;
  fetching?: boolean;
  /** Choices for rows per page; card grids use multiples of their column count. */
  pageSizes?: readonly number[];
  onChange: (next: { page: number; pageSize?: string }) => void;
}) {
  const t = useTranslations();
  const key = (suffix: string) => `${namespace}.${suffix}` as Parameters<typeof t>[0];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
        {t(key("pagination.showing"), {
          from: (page - 1) * pageSize + 1,
          to: Math.min(page * pageSize, total),
          total,
        })}
        {fetching ? (
          <>
            <Spinner className="size-3.5" />
            <span className="sr-only">{t(key("actions.loading"))}</span>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="hidden sm:inline">{t(key("pagination.pageSize"))}</span>
          <NativeSelect
            className="h-9 w-20 md:h-9"
            value={String(pageSize)}
            onChange={(event) => onChange({ pageSize: event.target.value, page: 1 })}
            aria-label={t(key("pagination.pageSize"))}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => onChange({ page: page - 1 })}
            aria-label={t(key("pagination.previous"))}
          >
            <ChevronLeftIcon className="rtl:rotate-180" />
          </Button>
          <span className="min-w-14 text-center text-sm font-medium tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => onChange({ page: page + 1 })}
            aria-label={t(key("pagination.next"))}
          >
            <ChevronRightIcon className="rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
