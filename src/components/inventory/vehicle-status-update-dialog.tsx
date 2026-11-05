"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { FormField } from "@/components/forms/form-field";
import { vehicleTitle } from "@/components/inventory/inventory-utils";
import { STATUS_ICONS } from "@/components/inventory/vehicle-select-icons";
import { VehicleStatusBadge } from "@/components/inventory/vehicle-status-badge";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { vehicleKeys, useReadyForSaleEligibility, useVehicleMutations } from "@/hooks/use-vehicles";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { getStatusUpdateTargets, type StatusUpdateTarget } from "@/lib/vehicles/status-transitions";
import type { VehicleListItem } from "@/types/vehicle";

export type StatusUpdateVehicle = Pick<
  VehicleListItem,
  | "id"
  | "status"
  | "stockNumber"
  | "make"
  | "model"
  | "variant"
  | "year"
  | "hasMinimumPrice"
  | "quantity"
>;

type Can = ReturnType<typeof usePermission>["can"];

/** Why a target can't be chosen right now, or null when it can. */
function targetBlocked(target: StatusUpdateTarget, vehicle: StatusUpdateVehicle, can: Can) {
  switch (target) {
    case "ready_for_sale":
      return can("vehicle.ready_for_sale") ? null : "noPermission";
    case "reserved":
      if (!can("reservation.create")) return "noPermission";
      return vehicle.hasMinimumPrice ? null : "noMinimumPrice";
    case "sold":
      if (!can("sale.create") && !can("vehicle.status.change")) return "noPermission";
      return vehicle.hasMinimumPrice ? null : "noMinimumPrice";
  }
}

/** Targets this user may see for the vehicle (blocked ones are shown disabled with a reason). */
export function useStatusUpdateTargets(vehicle: StatusUpdateVehicle) {
  const { can } = usePermission();
  return getStatusUpdateTargets(vehicle.status)
    .map((target) => ({ target, blocked: targetBlocked(target, vehicle, can) }))
    .filter((option) => option.blocked !== "noPermission");
}

/** How many units to move; only shown for multi-unit records. */
function UnitsField({
  vehicle,
  target,
  value,
  onChange,
}: {
  vehicle: StatusUpdateVehicle;
  target: StatusUpdateTarget;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();
  const units = Number(value);
  const invalid = !Number.isInteger(units) || units < 1 || units > vehicle.quantity;
  const remaining = vehicle.quantity - units;
  return (
    <FormField
      label={t("inventory.statusUpdate.units")}
      htmlFor="status-units"
      error={
        invalid ? t("inventory.statusUpdate.unitsInvalid", { count: vehicle.quantity }) : undefined
      }
      hint={
        invalid || remaining === 0
          ? t("inventory.statusUpdate.unitsAll", { count: vehicle.quantity })
          : t("inventory.statusUpdate.unitsSplit", {
              moved: units,
              remaining,
              target: t(`inventory.status.${target}`),
              current: t(`inventory.status.${vehicle.status}`),
            })
      }
    >
      <Input
        id="status-units"
        type="number"
        inputMode="numeric"
        min={1}
        max={vehicle.quantity}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className="h-10 sm:max-w-40"
      />
    </FormField>
  );
}

export function validUnits(vehicle: StatusUpdateVehicle, value: string) {
  const units = Number(value);
  return Number.isInteger(units) && units >= 1 && units <= vehicle.quantity;
}

function ChooseStep({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: StatusUpdateVehicle;
  selected: StatusUpdateTarget | null;
  onSelect: (target: StatusUpdateTarget) => void;
}) {
  const t = useTranslations();
  const options = useStatusUpdateTargets(vehicle);

  if (vehicle.status === "reserved") {
    return (
      <Alert>
        <AlertDescription className="grid gap-3">
          <span>{t("inventory.statusUpdate.bookedHint")}</span>
          <Link
            href="/bookings"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          >
            {t("inventory.statusUpdate.openBookings")}
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (options.length === 0) {
    return (
      <Alert>
        <AlertDescription>{t("inventory.dialogs.status.noTransitions")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("inventory.dialogs.status.newStatus")}
      className="grid gap-2"
    >
      {options.map(({ target, blocked }) => {
        const active = selected === target;
        return (
          <button
            key={target}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={blocked !== null}
            onClick={() => onSelect(target)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-start transition-colors outline-none",
              "focus-visible:ring-ring/50 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60",
              active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                active && "bg-primary text-primary-foreground",
              )}
              aria-hidden
            >
              {STATUS_ICONS[target]}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-medium">{t(`inventory.status.${target}`)}</span>
              <span className="text-muted-foreground text-xs">
                {blocked === "noMinimumPrice"
                  ? t("bookings.errors.noMinimumPrice")
                  : t(`inventory.statusUpdate.targets.${target}`)}
              </span>
            </span>
            {active ? (
              <CheckIcon className="text-primary mt-1 size-4 shrink-0" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Summary({
  vehicle,
  target,
  units,
}: {
  vehicle: StatusUpdateVehicle;
  target: StatusUpdateTarget;
  units: number;
}) {
  const t = useTranslations();
  return (
    <div className="bg-muted/40 grid gap-3 rounded-xl border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{vehicleTitle(vehicle)}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {vehicle.stockNumber}
          {vehicle.quantity > 1
            ? ` · ${t("inventory.statusUpdate.unitsOf", { units, count: vehicle.quantity })}`
            : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <VehicleStatusBadge status={vehicle.status} />
        <ArrowRightIcon
          className="text-muted-foreground size-4 rtl:rotate-180"
          aria-label={t("inventory.statusUpdate.to")}
        />
        <VehicleStatusBadge status={target} />
      </div>
    </div>
  );
}

function ReviewStep({
  vehicle,
  target,
  units,
  onBack,
  onDone,
}: {
  vehicle: StatusUpdateVehicle;
  /** Booked and Sold go to the booking / sale form instead of this review. */
  target: "ready_for_sale";
  units: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  const { markReadyForSale } = useVehicleMutations(vehicle.id);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | undefined>();

  const eligibility = useReadyForSaleEligibility(vehicle.id, true);
  const blockers = eligibility.data?.blockers ?? [];
  const canOverride =
    blockers.length > 0 &&
    Boolean(eligibility.data?.canOverride) &&
    can("vehicle.ready_for_sale.override");
  const blocked = blockers.length > 0 && !(canOverride && override);
  const loadingChecks = eligibility.isPending;
  const pending = markReadyForSale.isPending;

  async function confirm() {
    if (override && !overrideReason.trim()) {
      setOverrideError("validation.required");
      return;
    }
    const reason = note.trim() || null;
    // Only multi-unit records send a quantity; fewer than all splits them server-side.
    const quantity = vehicle.quantity > 1 ? units : undefined;
    try {
      const updated = await markReadyForSale.mutateAsync({
        reason,
        quantity,
        override: blockers.length > 0 && override,
        overrideReason: override ? overrideReason.trim() : null,
      });
      const status = t(`inventory.status.${target}`);
      toast.success(
        updated.id !== vehicle.id
          ? t("inventory.statusUpdate.doneSplit", { units, stock: updated.stockNumber, status })
          : t("inventory.statusUpdate.done", { status }),
      );
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inventory.toasts.error"));
    }
  }

  let checks: ReactNode = null;
  if (loadingChecks) {
    checks = <Skeleton className="h-16 w-full rounded-xl" />;
  } else if (blockers.length > 0) {
    checks = (
      <Alert variant={canOverride ? "default" : "destructive"}>
        <CircleAlertIcon aria-hidden />
        <AlertTitle>{t("inventory.readyForSale.blockedTitle")}</AlertTitle>
        <AlertDescription>
          <ul className="grid gap-1">
            {blockers.map((blocker, index) => (
              <li key={`${blocker.code}-${index}`}>• {blocker.message}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <Summary vehicle={vehicle} target={target} units={units} />

      <p className="text-muted-foreground text-sm">
        {t(`inventory.statusUpdate.confirmHint.${target}`)}
      </p>

      {checks}

      {canOverride ? (
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={override}
              onCheckedChange={(checked) => setOverride(checked === true)}
            />
            <span>{t("inventory.readyForSale.overrideToggle")}</span>
          </label>
          {override ? (
            <FormField
              label={t("inventory.readyForSale.overrideReason")}
              htmlFor="status-override-reason"
              error={overrideError}
              required
            >
              <Textarea
                id="status-override-reason"
                rows={2}
                maxLength={500}
                value={overrideReason}
                onChange={(event) => {
                  setOverrideReason(event.target.value);
                  setOverrideError(undefined);
                }}
                placeholder={t("inventory.readyForSale.overrideReasonPlaceholder")}
              />
            </FormField>
          ) : null}
        </div>
      ) : null}

      <FormField label={t("inventory.readyForSale.reasonOptional")} htmlFor="status-note">
        <Textarea
          id="status-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("inventory.readyForSale.reasonPlaceholder")}
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
          {t("inventory.stepper.back")}
        </Button>
        <LoadingButton
          type="button"
          loading={pending}
          disabled={loadingChecks || blocked}
          onClick={() => void confirm()}
        >
          {t(`inventory.statusUpdate.confirm.${target}`)}
        </LoadingButton>
      </DialogFooter>
    </div>
  );
}

function StatusUpdateFlow({
  vehicle,
  direct,
  onDone,
  onHandOff,
}: {
  vehicle: StatusUpdateVehicle;
  /** Skip the choose step when there's only one target and no units to pick. */
  direct?: boolean;
  onDone: () => void;
  /** Booked / Sold: hand over to the booking or sale form with the chosen number of units. */
  onHandOff: (target: "reserved" | "sold", units: number) => void;
}) {
  const t = useTranslations();
  const options = useStatusUpdateTargets(vehicle);
  const firstAvailable = options.find((option) => option.blocked === null)?.target ?? null;
  const [selected, setSelected] = useState<StatusUpdateTarget | null>(
    options.length === 1 ? firstAvailable : null,
  );
  // A whole in-transit batch usually arrives together; bookings and sales are usually one unit.
  const defaultUnits = (target: StatusUpdateTarget | null) =>
    String(target === "ready_for_sale" ? vehicle.quantity : 1);
  const [units, setUnits] = useState(() => defaultUnits(selected));
  const multiUnit = vehicle.quantity > 1;
  const [step, setStep] = useState<"choose" | "review">(
    direct && !multiUnit && selected === "ready_for_sale" ? "review" : "choose",
  );

  const unitsOk = !multiUnit || validUnits(vehicle, units);

  if (step === "review" && selected === "ready_for_sale") {
    return (
      <ReviewStep
        vehicle={vehicle}
        target={selected}
        units={multiUnit ? Number(units) : 1}
        onBack={() => setStep("choose")}
        onDone={onDone}
      />
    );
  }

  function next() {
    if (!selected || !unitsOk) return;
    if (selected === "ready_for_sale") setStep("review");
    else onHandOff(selected, multiUnit ? Number(units) : 1);
  }

  return (
    <div className="grid gap-4">
      <ChooseStep
        vehicle={vehicle}
        selected={selected}
        onSelect={(target) => {
          setSelected(target);
          setUnits(defaultUnits(target));
        }}
      />
      {multiUnit && selected ? (
        <UnitsField vehicle={vehicle} target={selected} value={units} onChange={setUnits} />
      ) : null}
      <DialogFooter showCloseButton={options.length === 0}>
        {options.length > 0 ? (
          <>
            <Button type="button" variant="outline" onClick={onDone}>
              {t("inventory.actions.cancel")}
            </Button>
            <Button type="button" disabled={!selected || !unitsOk} onClick={next}>
              {selected === "reserved"
                ? t("inventory.statusUpdate.confirm.reserved")
                : t("inventory.stepper.continue")}
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </div>
  );
}

export function VehicleStatusUpdateDialog({
  vehicle,
  open,
  onOpenChange,
  direct,
}: {
  vehicle: StatusUpdateVehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open at the confirm step when the only move is Ready for sale (one unit). */
  direct?: boolean;
}) {
  const t = useTranslations();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  // Booked / Sold open the booking form in place (in sale mode for Sold), prefilled with
  // this car and the units chosen, so the customer, sales executive and price are recorded.
  const [booking, setBooking] = useState<{ sell: boolean; units: number; key: number } | null>(
    null,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("inventory.statusUpdate.title")}</DialogTitle>
            <DialogDescription>
              {t("inventory.dialogs.status.description", {
                status: t(`inventory.status.${vehicle.status}`),
              })}
            </DialogDescription>
          </DialogHeader>
          {/* Keyed so each opening starts fresh at the choose step. */}
          {open ? (
            <StatusUpdateFlow
              key={vehicle.status}
              vehicle={vehicle}
              direct={direct}
              onDone={() => onOpenChange(false)}
              onHandOff={(target, units) => {
                onOpenChange(false);
                setBooking({ sell: target === "sold", units, key: Date.now() });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {booking ? (
        <NewBookingDialog
          key={booking.key}
          open
          onOpenChange={(next) => {
            if (!next) setBooking(null);
          }}
          initialVehicleId={vehicle.id}
          initialQuantity={booking.units}
          sell={booking.sell}
          canCreateCustomer={can("customer.create")}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: vehicleKeys.all })}
        />
      ) : null}
    </>
  );
}
