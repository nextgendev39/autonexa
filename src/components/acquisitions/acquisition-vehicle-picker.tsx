"use client";

import {
  InventoryVehiclePicker,
  type InventoryVehiclePickerProps,
} from "@/components/inventory/inventory-vehicle-picker";

/** Acquisition picker — only Acquired inventory vehicles. */
export function AcquisitionVehiclePicker(
  props: Omit<InventoryVehiclePickerProps, "statuses" | "labelsKey">,
) {
  return (
    <InventoryVehiclePicker
      {...props}
      statuses={["acquired"]}
      labelsKey="acquisitions.vehiclePicker"
    />
  );
}
