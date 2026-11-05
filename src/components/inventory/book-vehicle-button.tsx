"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { vehicleKeys } from "@/hooks/use-vehicles";
import type { VehicleListItem } from "@/types/vehicle";

/** Ready-for-sale cars can be booked once a minimum selling price is set. Opens the booking form in place. */
export function BookVehicleButton({
  vehicle,
  variant,
  compact = false,
}: {
  vehicle: Pick<VehicleListItem, "id" | "status" | "hasMinimumPrice">;
  variant: "ghost" | "outline";
  /** Icon-only on small screens (table rows). */
  compact?: boolean;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  if (!can("reservation.create") || vehicle.status !== "ready_for_sale") return null;

  const label = (
    <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{t("bookings.book")}</span>
  );

  if (!vehicle.hasMinimumPrice) {
    const reason = t("bookings.errors.noMinimumPrice");
    return (
      // Wrapper keeps the tooltip working on the disabled button.
      <span title={reason} className="inline-flex">
        <Button
          type="button"
          variant={variant}
          size="sm"
          disabled
          aria-label={`${t("bookings.book")}: ${reason}`}
        >
          <CalendarCheckIcon className="size-4" aria-hidden />
          {label}
        </Button>
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        aria-label={t("bookings.book")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
      >
        <CalendarCheckIcon className="size-4" aria-hidden />
        {label}
      </Button>
      {/* The dialog is portalled, but React still bubbles its clicks to row/card links. */}
      <span className="contents" data-row-stop onClick={(event) => event.stopPropagation()}>
        {open ? (
          <NewBookingDialog
            key={formKey}
            open
            onOpenChange={setOpen}
            initialVehicleId={vehicle.id}
            canCreateCustomer={can("customer.create")}
            onCreated={() => void queryClient.invalidateQueries({ queryKey: vehicleKeys.all })}
          />
        ) : null}
      </span>
    </>
  );
}
