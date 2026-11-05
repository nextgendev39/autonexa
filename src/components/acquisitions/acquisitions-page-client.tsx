"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AcquisitionFilters } from "@/components/acquisitions/acquisition-filters";
import {
  buildApiQuery,
  hasActiveQuery,
  readPage,
  readPageSize,
  useAcquisitionUrlState,
} from "@/components/acquisitions/acquisition-query";
import { AcquisitionSummary } from "@/components/acquisitions/acquisition-summary";
import { AcquisitionTable } from "@/components/acquisitions/acquisition-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/tables/list-pagination";
import { ListSkeleton } from "@/components/feedback/skeletons";
import { ViewModeToggle } from "@/components/tables/view-mode-toggle";
import { Button } from "@/components/ui/button";
import { useAcquisitionList } from "@/hooks/use-acquisitions";
import { useListViewMode } from "@/hooks/use-list-view-mode";
import { usePermission } from "@/hooks/use-permission";
import { Link } from "@/lib/i18n/navigation";

export function AcquisitionsPageClient() {
  const t = useTranslations("acquisitions");
  const { can } = usePermission();
  const searchParams = useSearchParams();
  const { update } = useAcquisitionUrlState();
  const { mode, setMode } = useListViewMode("autonexa.acquisitions.viewMode", "list");

  const apiQuery = buildApiQuery(searchParams);
  const { data, isLoading, error, refetch, isFetching } = useAcquisitionList(apiQuery);

  const page = readPage(searchParams);
  const pageSize = readPageSize(searchParams);
  const filtered = hasActiveQuery(searchParams);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          can("acquisition.create") ? (
            <Button variant="brand" nativeButton={false} render={<Link href="/inventory/new" />}>
              {t("actions.addViaInventory")}
            </Button>
          ) : null
        }
      />

      <AcquisitionSummary summary={data?.summary} />

      <AcquisitionFilters actions={<ViewModeToggle mode={mode} onChange={setMode} />} />

      {isLoading ? <ListSkeleton /> : null}

      {error ? (
        <EmptyState
          title={t("errors.loadTitle")}
          description={error.message}
          action={
            <Button type="button" variant="outline" onClick={() => refetch()}>
              {t("actions.retry")}
            </Button>
          }
        />
      ) : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          title={filtered ? t("empty.filteredTitle") : t("empty.title")}
          description={filtered ? t("empty.filteredHint") : t("empty.hint")}
          action={
            can("acquisition.create") && !filtered ? (
              <Button variant="brand" nativeButton={false} render={<Link href="/inventory/new" />}>
                {t("actions.addViaInventory")}
              </Button>
            ) : null
          }
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <AcquisitionTable acquisitions={data.items} viewMode={mode} />

          <ListPagination
            namespace="acquisitions"
            page={page}
            pageSize={pageSize}
            total={data.total}
            fetching={isFetching}
            onChange={update}
          />
        </>
      ) : null}
    </div>
  );
}
