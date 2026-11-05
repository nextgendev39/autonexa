export const VEHICLE_DOCUMENT_SOURCES = [
  "general",
  "acquisition",
  "reconditioning",
  "pricing",
] as const;

export type VehicleDocumentSource = (typeof VEHICLE_DOCUMENT_SOURCES)[number];

export type VehicleDocumentItem = {
  id: string;
  vehicleId: string;
  source: VehicleDocumentSource;
  sourceEntityId: string;
  category: string;
  categoryLabel: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string;
  bucket: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  amount: number | null;
  currency: string | null;
  referenceNumber: string | null;
  url: string | null;
  kind: "document" | "photo";
};

export type VehicleDocumentCounts = Record<VehicleDocumentSource | "all", number>;

export type VehicleDocumentsResult = {
  items: VehicleDocumentItem[];
  counts: VehicleDocumentCounts;
  errors: Partial<Record<VehicleDocumentSource, string>>;
};

export type VehicleCostSummary = {
  purchaseCost: number | null;
  acquisitionExpenses: number | null;
  workshopCost: number | null;
  otherCosts: number | null;
  totalVehicleCost: number | null;
  currency: string;
  canView: boolean;
};
