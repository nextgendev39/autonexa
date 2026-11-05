export const ACQUISITION_DOCUMENT_CATEGORIES = [
  "purchase_invoice",
  "auction_invoice",
  "seller_invoice",
  "purchase_agreement",
  "payment_receipt",
  "transport_document",
  "customs_document",
  "import_document",
  "registration_document",
  "inspection_document",
  "ownership_document",
  "other",
] as const;

export type AcquisitionDocumentCategory = (typeof ACQUISITION_DOCUMENT_CATEGORIES)[number];

/** 20 MB — matches / is under vehicle-documents bucket limit (25 MB). */
export const ACQUISITION_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const ACQUISITION_DOCUMENT_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcquisitionDocument = {
  id: string;
  acquisitionId: string;
  vehicleId: string;
  branchId: string | null;
  category: AcquisitionDocumentCategory | string;
  categoryLabel: string;
  title: string;
  fileName: string;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string;
  referenceNumber: string | null;
  notes: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
  url: string | null;
};

export type PendingAcquisitionDocument = {
  localId: string;
  file: File;
  previewUrl: string;
  category: AcquisitionDocumentCategory;
  title: string;
  referenceNumber: string;
  notes: string;
  status?: "ready" | "uploading" | "saving" | "error" | "waiting";
  progress?: number;
  errorMessage?: string;
};
