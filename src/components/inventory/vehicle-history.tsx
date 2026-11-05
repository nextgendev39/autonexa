"use client";

import { ArrowRightIcon, HistoryIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { VehicleStatusBadge } from "@/components/inventory/vehicle-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimelineSkeleton } from "@/components/feedback/skeletons";
import { useVehicleHistory } from "@/hooks/use-vehicles";
import { formatDate } from "@/lib/utils/date";

function humanizeAction(action: string) {
  const text = action.replace(/[._]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function VehicleHistory({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const history = useVehicleHistory(vehicleId);

  if (history.isPending) {
    return (
      <TimelineSkeleton cards={2} />
    );
  }

  if (history.isError) {
    return <ErrorState onRetry={() => void history.refetch()} />;
  }

  const { statusHistory, activity } = history.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("inventory.history.statusHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {statusHistory.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title={t("inventory.history.noStatus")}
              description={t("inventory.history.noStatusHint")}
              className="border-0 py-8"
            />
          ) : (
            <ol className="border-border relative ms-2 grid gap-5 border-s ps-5">
              {statusHistory.map((item) => (
                <li key={item.id} className="relative">
                  <span
                    className="bg-primary ring-background absolute -start-[27px] top-1.5 size-2.5 rounded-full ring-4"
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {item.oldStatus ? (
                      <>
                        <VehicleStatusBadge status={item.oldStatus} />
                        <ArrowRightIcon className="text-muted-foreground size-3.5 rtl:rotate-180" aria-hidden />
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t("inventory.history.initial")}
                      </span>
                    )}
                    <VehicleStatusBadge status={item.newStatus} />
                  </div>
                  {item.reason ? <p className="mt-1.5 text-sm">{item.reason}</p> : null}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatDate(item.createdAt, locale, "dateTime")} ·{" "}
                    {t("inventory.history.changedBy", {
                      name: item.changedByName ?? t("inventory.history.system"),
                    })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("inventory.history.activity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title={t("inventory.history.noActivity")}
              description={t("inventory.history.noActivityHint")}
              className="border-0 py-8"
            />
          ) : (
            <ul className="grid gap-4">
              {activity.map((item) => (
                <li key={item.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                  <p className="text-sm font-medium">{humanizeAction(item.action)}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDate(item.createdAt, locale, "dateTime")} ·{" "}
                    {t("inventory.history.changedBy", {
                      name: item.userName ?? t("inventory.history.system"),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
