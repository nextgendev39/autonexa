"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { DataPanel } from "@/components/layout/data-panel";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  buildApiQuery,
  hasActiveQuery,
  readPage,
  readPageSize,
  useInventoryUrlState,
} from "@/components/inventory/inventory-query";
import { VehicleFilters } from "@/components/inventory/vehicle-filters";
import { VehicleSummary } from "@/components/inventory/vehicle-summary";
import { VehicleTable } from "@/components/inventory/vehicle-table";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/tables/list-pagination";
import { VehicleResultsSkeleton } from "@/components/feedback/skeletons";
import { ViewModeToggle } from "@/components/tables/view-mode-toggle";
import { Button } from "@/components/ui/button";
import { useListViewMode } from "@/hooks/use-list-view-mode";
import { usePermission } from "@/hooks/use-permission";
import { useVehicleList } from "@/hooks/use-vehicles";
import { Link } from "@/lib/i18n/navigation";

export function InventoryPageClient() {
  const t = useTranslations("inventory");
  const { can } = usePermission();
  const searchParams = useSearchParams();
  const { update } = useInventoryUrlState();
  const { mode, setMode } = useListViewMode("autonexa.inventory.viewMode", "list");

  const apiQuery = buildApiQuery(searchParams);
  const { data, isLoading, error, refetch, isFetching } = useVehicleList(apiQuery);

  const page = readPage(searchParams);
  const pageSize = readPageSize(searchParams);
  const filtered = hasActiveQuery(searchParams);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          can("vehicle.create") ? (
            <Button variant="brand" nativeButton={false} render={<Link href="/inventory/new" />}>
              {t("actions.add")}
            </Button>
          ) : null
        }
      />

      <VehicleSummary summary={data?.summary} />

      {/* Showroom panel: filters as the toolbar, results in the body, pages in the footer. */}
      <DataPanel
        className="animate-rise [animation-delay:80ms]"
        toolbar={<VehicleFilters actions={<ViewModeToggle mode={mode} onChange={setMode} />} />}
        footer={
          data && data.items.length > 0 ? (
            <ListPagination
              namespace="inventory"
              page={page}
              pageSize={pageSize}
              total={data.total}
              fetching={isFetching}
              onChange={update}
            />
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="bg-muted/35 p-3 sm:p-4">
            <VehicleResultsSkeleton view={mode} />
          </div>
        ) : null}

        {error ? (
          <EmptyState
            inset
            className="py-12"
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
            inset
            className="py-14"
            title={filtered ? t("empty.filteredTitle") : t("empty.title")}
            description={filtered ? t("empty.filteredHint") : t("empty.hint")}
            action={
              can("vehicle.create") && !filtered ? (
                <Button
                  variant="brand"
                  nativeButton={false}
                  render={<Link href="/inventory/new" />}
                >
                  {t("actions.add")}
                </Button>
              ) : null
            }
          />
        ) : null}

        {data && data.items.length > 0 ? (
          <VehicleTable vehicles={data.items} viewMode={mode} embedded />
        ) : null}
      </DataPanel>
    </div>
  );
}
