"use client";

import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { VehicleStatusBadge } from "@/components/inventory/vehicle-status-badge";
import {
  VehicleStatusUpdateDialog,
  useStatusUpdateTargets,
  type StatusUpdateVehicle,
} from "@/components/inventory/vehicle-status-update-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Opens Update status for one vehicle.
 * `badge`: the status badge itself is the trigger (table rows); falls back to a plain badge.
 * `button`: an "Update status" button (vehicle page header, grid cards); hidden when nothing applies.
 */
export function VehicleStatusTrigger({
  vehicle,
  variant,
  className,
}: {
  vehicle: StatusUpdateVehicle;
  variant: "badge" | "button";
  className?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const options = useStatusUpdateTargets(vehicle);
  // Booked cars open a pointer to Bookings, where the booking is sold or cancelled.
  const actionable = options.length > 0 || vehicle.status === "reserved";

  if (!actionable) {
    return variant === "badge" ? <VehicleStatusBadge status={vehicle.status} /> : null;
  }

  const openDialog = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      {variant === "badge" ? (
        <button
          type="button"
          onClick={openDialog}
          aria-label={t("inventory.statusUpdate.triggerLabel", {
            status: t(`inventory.status.${vehicle.status}`),
          })}
          className={cn(
            "group/status inline-flex items-center gap-1 rounded-full outline-none",
            "focus-visible:ring-ring/50 focus-visible:ring-3",
            className,
          )}
        >
          <VehicleStatusBadge status={vehicle.status} />
          <ChevronDownIcon
            className="text-muted-foreground group-hover/status:text-foreground size-3.5 transition-colors"
            aria-hidden
          />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openDialog}
          className={className}
        >
          <RefreshCwIcon aria-hidden />
          {t("inventory.statusUpdate.title")}
        </Button>
      )}
      {/* The dialog is portalled, but React still bubbles its clicks to row/card links. */}
      <span className="contents" data-row-stop onClick={(event) => event.stopPropagation()}>
        <VehicleStatusUpdateDialog vehicle={vehicle} open={open} onOpenChange={setOpen} />
      </span>
    </>
  );
}
