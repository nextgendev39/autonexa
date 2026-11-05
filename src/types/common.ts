/**
 * Sample/UI placeholder statuses used by Phase 2 mock dashboard data.
 * Production statuses live in Database['public']['Enums'] (see types/database.ts).
 */
export type SampleRecord = {
  sample: true;
};

export type VehicleStatus = "available" | "reserved" | "sold";

export type LeadStatus = "new" | "contacted" | "qualified";

export type SaleStatus = "draft" | "confirmed";
