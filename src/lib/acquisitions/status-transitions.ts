import type { AcquisitionStatus } from "@/types/acquisition";
import { ACQUISITION_STATUSES } from "@/types/acquisition";

/**
 * Central acquisition workflow map (mirrors PostgreSQL is_valid_acquisition_status_transition).
 */
export const ACQUISITION_STATUS_TRANSITIONS: Record<
  AcquisitionStatus,
  readonly AcquisitionStatus[]
> = {
  draft: ["sourcing", "cancelled"],
  sourcing: ["negotiating", "cancelled"],
  negotiating: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected"],
  approved: ["purchased", "cancelled", "pending_approval"],
  purchased: ["documents_pending", "received"],
  documents_pending: ["received"],
  received: [],
  cancelled: [],
  rejected: ["negotiating", "cancelled"],
};

export function getAllowedNextStatuses(from: AcquisitionStatus): AcquisitionStatus[] {
  return [...ACQUISITION_STATUS_TRANSITIONS[from]];
}

export function isValidAcquisitionStatusTransition(
  from: AcquisitionStatus,
  to: AcquisitionStatus,
) {
  if (from === to) return true;
  return ACQUISITION_STATUS_TRANSITIONS[from].includes(to);
}

export function isAcquisitionStatus(value: string): value is AcquisitionStatus {
  return (ACQUISITION_STATUSES as readonly string[]).includes(value);
}

/** Fields generally locked once received. */
export function isAcquisitionLocked(status: AcquisitionStatus) {
  return status === "received" || status === "cancelled";
}

export function canEditAcquisitionFields(status: AcquisitionStatus) {
  return (
    status === "draft" ||
    status === "sourcing" ||
    status === "negotiating" ||
    status === "rejected"
  );
}

export function canEditPurchaseTerms(status: AcquisitionStatus) {
  return (
    status === "draft" ||
    status === "sourcing" ||
    status === "negotiating" ||
    status === "approved" ||
    status === "rejected"
  );
}
