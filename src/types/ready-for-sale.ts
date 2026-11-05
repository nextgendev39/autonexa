import type { VehicleStatus } from "@/types/vehicle";

export type ReadyForSaleAction = "view_documents" | null;

export type ReadyForSaleCheck = {
  key: string;
  ok: boolean;
  label: string;
};

export type ReadyForSaleBlocker = {
  code: string;
  message: string;
  action: ReadyForSaleAction;
};

/** Eligibility for In transit → Ready for sale (documents and status checks only). */
export type ReadyForSaleEligibility = {
  eligible: boolean;
  canOverride: boolean;
  vehicleId: string;
  stockNumber: string;
  make: string;
  model: string;
  year: number;
  currentStatus: VehicleStatus;
  checks: ReadyForSaleCheck[];
  blockers: ReadyForSaleBlocker[];
  error?: string;
};

export type MarkReadyForSaleInput = {
  reason?: string | null;
  override?: boolean;
  overrideReason?: string | null;
};
