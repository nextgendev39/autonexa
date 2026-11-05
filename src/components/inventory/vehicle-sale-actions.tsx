"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheckIcon, CalendarCheckIcon, PackageCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import {
  VehicleStatusUpdateDialog,
  type StatusUpdateVehicle,
} from "@/components/inventory/vehicle-status-update-dialog";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { vehicleKeys } from "@/hooks/use-vehicles";
import { cn } from "@/lib/utils";
import type { VehicleListItem } from "@/types/vehicle";

type SaleVehicle = StatusUpdateVehicle & Pick<VehicleListItem, "hasMinimumPrice">;

/**
 * Which actions this user gets for the car: Mark ready for sale while it's In transit,
 * then Book now / Mark as sold once it's Ready for sale.
 */
export function useSaleActions(vehicle: Pick<VehicleListItem, "status">) {
  const { can } = usePermission();
  const ready = vehicle.status === "ready_for_sale";
  const canMarkReady = vehicle.status === "acquired" && can("vehicle.ready_for_sale");
  const canBook = ready && can("reservation.create");
  const canSell = ready && (can("sale.create") || can("vehicle.status.change"));
  return { canMarkReady, canBook, canSell, any: canMarkReady || canBook || canSell };
}

const LAYOUT = {
  /** Page header: full-size, sharing the row on phones. */
  header: {
    size: "default",
    wrapper: "flex-1 sm:flex-none",
    button: "h-10 w-full md:h-9",
    label: "",
  },
  /** Sticky tab bar: small, icon-only on phones. */
  bar: { size: "sm", wrapper: "shrink-0", button: "h-9", label: "hidden sm:inline" },
  /** Table row: small, labels from wide screens. */
  row: { size: "sm", wrapper: "shrink-0", button: "h-8", label: "hidden xl:inline" },
  /** Grid card footer: buttons share the width. */
  card: { size: "sm", wrapper: "min-w-0 flex-1", button: "h-9 w-full", label: "truncate" },
} as const;

/**
 * "Book now" and "Mark as sold" for a Ready for sale car, each opening the booking form
 * in place (the sale form takes no deposit). Both need a minimum selling price first.
 * An In transit car gets "Mark ready for sale" instead, which runs the readiness checks.
 */
export function VehicleSaleActions({
  vehicle,
  layout = "header",
}: {
  vehicle: SaleVehicle;
  layout?: keyof typeof LAYOUT;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const { canMarkReady, canBook, canSell } = useSaleActions(vehicle);
  const [form, setForm] = useState<{ sell: boolean; key: number } | null>(null);
  const [readyOpen, setReadyOpen] = useState(false);
  if (!canMarkReady && !canBook && !canSell) return null;

  const style = LAYOUT[layout];

  if (canMarkReady) {
    const label = t("inventory.statusUpdate.confirm.ready_for_sale");
    return (
      <>
        <span title={label} className={cn("inline-flex", style.wrapper)}>
          <Button
            type="button"
            variant="brand"
            size={style.size}
            className={style.button}
            aria-label={label}
            onClick={(event) => {
              // Rows and cards are links; the button opens the dialog instead.
              event.preventDefault();
              event.stopPropagation();
              setReadyOpen(true);
            }}
          >
            <PackageCheckIcon aria-hidden />
            <span className={style.label || undefined}>{label}</span>
          </Button>
        </span>
        <span className="contents" data-row-stop onClick={(event) => event.stopPropagation()}>
          <VehicleStatusUpdateDialog
            vehicle={vehicle}
            open={readyOpen}
            onOpenChange={setReadyOpen}
            direct
          />
        </span>
      </>
    );
  }

  const blocked = vehicle.hasMinimumPrice ? undefined : t("bookings.errors.noMinimumPrice");
  const button = (sell: boolean) => {
    const label = sell ? t("bookings.markSold") : t("inventory.actions.bookNow");
    return (
      // The wrapper keeps the reason tooltip working on a disabled button.
      <span
        key={sell ? "sell" : "book"}
        title={blocked ?? label}
        className={cn("inline-flex", style.wrapper)}
      >
        <Button
          type="button"
          variant={sell ? "outline" : "brand"}
          size={style.size}
          className={style.button}
          disabled={!!blocked}
          aria-label={blocked ? `${label}: ${blocked}` : label}
          onClick={(event) => {
            // Rows and cards are links; the button opens the form instead.
            event.preventDefault();
            event.stopPropagation();
            setForm({ sell, key: Date.now() });
          }}
        >
          {sell ? <BadgeCheckIcon aria-hidden /> : <CalendarCheckIcon aria-hidden />}
          <span className={style.label || undefined}>{label}</span>
        </Button>
      </span>
    );
  };

  return (
    <>
      {canBook ? button(false) : null}
      {canSell ? button(true) : null}
      {/* The dialog is portalled, but React still bubbles its clicks to row/card links. */}
      <span className="contents" data-row-stop onClick={(event) => event.stopPropagation()}>
        {form ? (
          <NewBookingDialog
            key={form.key}
            open
            onOpenChange={(open) => {
              if (!open) setForm(null);
            }}
            initialVehicleId={vehicle.id}
            sell={form.sell}
            canCreateCustomer={can("customer.create")}
            onCreated={() => void queryClient.invalidateQueries({ queryKey: vehicleKeys.all })}
          />
        ) : null}
      </span>
    </>
  );
}
