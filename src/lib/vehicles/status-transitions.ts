import type { VehicleStatus } from "@/types/vehicle";
import { VEHICLE_STATUSES } from "@/types/vehicle";

/**
 * Central vehicle lifecycle map (mirrors PostgreSQL is_valid_vehicle_status_transition).
 * UI uses this to offer only valid next statuses; DB enforces the same rules.
 */
export const VEHICLE_STATUS_TRANSITIONS: Record<VehicleStatus, readonly VehicleStatus[]> = {
  // acquired → ready_for_sale is allowed in DB only via mark_vehicle_ready_for_sale.
  acquired: ["under_inspection", "ready_for_sale"],
  under_inspection: ["ready_for_sale", "under_repair", "inspection_failed"],
  inspection_failed: ["under_repair", "under_inspection", "ready_for_sale", "archived"],
  under_repair: ["under_inspection", "ready_for_sale"],
  ready_for_sale: ["reserved", "sold", "under_repair"],
  reserved: ["sold", "ready_for_sale"],
  sold: ["delivered"],
  delivered: ["returned"],
  returned: ["under_inspection", "archived"],
  archived: [],
};

/** Business statuses a user can move a vehicle to from the Update status flow. */
export type StatusUpdateTarget = "ready_for_sale" | "reserved" | "sold";

/**
 * Next statuses offered by Update status, in the order shown.
 * In transit → Ready for sale uses mark_vehicle_ready_for_sale; Booked opens the booking
 * flow; Sold is a direct status change. Booked cars are moved on from the Bookings page.
 */
export function getStatusUpdateTargets(from: VehicleStatus): StatusUpdateTarget[] {
  switch (from) {
    case "acquired":
      return ["ready_for_sale"];
    case "ready_for_sale":
      return ["reserved", "sold"];
    default:
      return [];
  }
}

/** Statuses that can move to archived via the archive action (not sold/delivered). */
export function canArchiveStatus(status: VehicleStatus) {
  return status !== "sold" && status !== "delivered" && status !== "archived";
}

/** Sold and delivered cars are locked: their details and photos can no longer be edited. */
export function isSoldStatus(status: VehicleStatus) {
  return status === "sold" || status === "delivered";
}

export function getAllowedNextStatuses(from: VehicleStatus): VehicleStatus[] {
  const next = [...VEHICLE_STATUS_TRANSITIONS[from]];
  if (canArchiveStatus(from) && !next.includes("archived")) {
    // Archive is available via dedicated archive action; keep transition map for DB parity.
  }
  return next;
}

export function isValidVehicleStatusTransition(from: VehicleStatus, to: VehicleStatus) {
  if (from === to) return true;
  if (VEHICLE_STATUS_TRANSITIONS[from].includes(to)) return true;
  if (to === "archived" && canArchiveStatus(from)) return true;
  return false;
}

export function isVehicleStatus(value: string): value is VehicleStatus {
  return (VEHICLE_STATUSES as readonly string[]).includes(value);
}
