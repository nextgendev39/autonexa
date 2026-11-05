"use client";

import { useTranslations } from "next-intl";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { quantityTotal } from "@/lib/vehicles/quantity";
import type { VehicleListItem } from "@/types/vehicle";

type PriceVehicle = Pick<VehicleListItem, "currentSellingPrice" | "minimumSellingPrice" | "quantity">;

/** Selling price, else the minimum selling price (labelled), for list and grid views. */
export function listPrice(vehicle: PriceVehicle) {
  if (vehicle.currentSellingPrice != null) return { amount: vehicle.currentSellingPrice, isMinimum: false };
  if (vehicle.minimumSellingPrice != null) return { amount: vehicle.minimumSellingPrice, isMinimum: true };
  return null;
}

export function VehiclePrice({
  vehicle,
  className,
  amountClassName,
}: {
  vehicle: PriceVehicle;
  className?: string;
  amountClassName?: string;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const price = listPrice(vehicle);
  if (!price) return <span className={className}>—</span>;

  const multi = vehicle.quantity > 1;
  const amount = formatCurrency(price.amount, locale);

  return (
    <span className={cn("block tabular-nums", className)}>
      {price.isMinimum ? (
        <span className="text-muted-foreground block text-xs">{t("inventory.fields.minimumPrice")}</span>
      ) : null}
      <span className={cn("block", amountClassName)}>
        {multi ? t("inventory.quantity.perUnitValue", { value: amount }) : amount}
      </span>
      {multi ? (
        <span className="text-muted-foreground block text-xs">
          {t("inventory.quantity.totalValue", {
            value: formatCurrency(quantityTotal(price.amount, vehicle.quantity)!, locale),
          })}
        </span>
      ) : null}
    </span>
  );
}
