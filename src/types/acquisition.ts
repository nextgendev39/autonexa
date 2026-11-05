export const ACQUISITION_STATUSES = [
  "draft",
  "sourcing",
  "negotiating",
  "pending_approval",
  "approved",
  "purchased",
  "documents_pending",
  "received",
  "cancelled",
  "rejected",
] as const;

export type AcquisitionStatus = (typeof ACQUISITION_STATUSES)[number];

export const ACQUISITION_SOURCE_TYPES = [
  "individual_owner",
  "dealer",
  "auction",
  "trade_in",
  "fleet",
  "importer",
  "company",
  "broker",
  "other",
] as const;

export type AcquisitionSourceType = (typeof ACQUISITION_SOURCE_TYPES)[number];

export const ACQUISITION_DOCUMENT_STATUSES = ["pending", "partial", "complete"] as const;
export type AcquisitionDocumentStatus = (typeof ACQUISITION_DOCUMENT_STATUSES)[number];

export const ACQUISITION_REGISTRATION_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "not_required",
] as const;
export type AcquisitionRegistrationStatus =
  (typeof ACQUISITION_REGISTRATION_STATUSES)[number];

export const ACQUISITION_PAYMENT_STATUSES = ["not_paid", "partially_paid", "paid"] as const;
export type AcquisitionPaymentStatus = (typeof ACQUISITION_PAYMENT_STATUSES)[number];

/** Unified vehicle_expenses categories used for acquisition line items. */
export const ACQUISITION_EXPENSE_TYPES = [
  "purchase",
  "transportation",
  "auction",
  "broker_fee",
  "registration",
  "insurance",
  "import_duty",
  "clearance",
  "inspection",
  "customs",
  "other",
] as const;

export type AcquisitionExpenseType = (typeof ACQUISITION_EXPENSE_TYPES)[number];

/** Expense lines the acquisition form edits directly as Shipping Cost and Other Fees. */
export const ACQUISITION_FORM_EXPENSES = [
  { field: "shippingCost", category: "transportation", description: "Shipping" },
  { field: "otherFees", category: "other", description: "Other fees" },
] as const satisfies ReadonlyArray<{
  field: string;
  category: AcquisitionExpenseType;
  description: string;
}>;

export const ACQUISITION_SORT_FIELDS = [
  "created_at",
  "updated_at",
  "acquisition_number",
  "purchase_date",
  "status",
  "source_type",
] as const;

export type AcquisitionSortField = (typeof ACQUISITION_SORT_FIELDS)[number];

export type AcquisitionListItem = {
  id: string;
  acquisitionNumber: string;
  status: AcquisitionStatus;
  sourceType: AcquisitionSourceType;
  sourceName: string | null;
  branchId: string;
  branchName: string | null;
  vehicleId: string;
  vehicleStockNumber: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleVin: string | null;
  purchaseDate: string | null;
  expectedArrivalDate: string | null;
  paymentStatus: AcquisitionPaymentStatus;
  documentStatus: AcquisitionDocumentStatus;
  registrationStatus: AcquisitionRegistrationStatus;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when caller has acquisition.cost.view / vehicle.cost.view */
  purchasePrice?: number;
  askingPrice?: number | null;
  expenseTotal?: number;
  totalAcquisitionCost?: number;
};

export type AcquisitionExpense = {
  id: string;
  acquisitionId: string;
  vehicleId: string;
  expenseType: AcquisitionExpenseType;
  description: string | null;
  amount: number;
  currency: string;
  expenseDate: string;
  vendor: string | null;
  reference: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type AcquisitionStatusHistoryItem = {
  id: string;
  acquisitionId: string;
  oldStatus: AcquisitionStatus | null;
  newStatus: AcquisitionStatus;
  reason: string | null;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
};

export type AcquisitionActivityItem = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AcquisitionDetail = AcquisitionListItem & {
  vehicleVariant: string | null;
  vehicleMileage: number | null;
  vehicleOriginType: string | null;
  vehicleCountryOfOrigin: string | null;
  sourceCompany: string | null;
  sourcePhone: string | null;
  sourceEmail: string | null;
  sourceReference: string | null;
  lotNumber: string | null;
  supplierId: string | null;
  customerId: string | null;
  currency: string;
  receivedDate: string | null;
  notes: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  rejectedBy: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  expenses?: AcquisitionExpense[];
};

export type AcquisitionSummary = {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  purchased: number;
  documentsPending: number;
  received: number;
  cancelled: number;
};

export type AcquisitionListResult = {
  items: AcquisitionListItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: AcquisitionSummary;
};

export type AcquisitionMeta = {
  branches: { id: string; name: string; code: string | null }[];
  makes: { id: string; name: string }[];
  models: { id: string; makeId: string; name: string }[];
  sourceTypes: readonly AcquisitionSourceType[];
  expenseTypes: readonly AcquisitionExpenseType[];
  statuses: readonly AcquisitionStatus[];
};
