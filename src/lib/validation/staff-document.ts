import { z } from "zod";

export const STAFF_DOCUMENT_CATEGORIES = [
  "emirates_id",
  "passport",
  "visa",
  "driving_license",
  "contract",
  "certificate",
  "other",
] as const;

export type StaffDocumentCategory = (typeof STAFF_DOCUMENT_CATEGORIES)[number];

export const STAFF_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const STAFF_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** For the file picker's `accept`. */
export const STAFF_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx";

export const staffDocumentMetaSchema = z.object({
  category: z.enum(STAFF_DOCUMENT_CATEGORIES),
  title: z.string().trim().min(1, { error: "validation.required" }).max(150),
  expiresOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "validation.date" })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(1000).optional(),
});

export type StaffDocumentMeta = z.infer<typeof staffDocumentMetaSchema>;

/** Error message key for a file the server won't accept, or null. */
export function validateStaffDocumentFile(file: { type: string; size: number; name: string }) {
  if (file.size === 0) return "documents.errors.empty";
  if (file.size > STAFF_DOCUMENT_MAX_BYTES) return "documents.errors.tooLarge";
  const type = (file.type || "").toLowerCase();
  const okType =
    (STAFF_DOCUMENT_MIME_TYPES as readonly string[]).includes(type) ||
    type === "image/jpg" ||
    // Some browsers leave HEIC/Word types blank; fall back to the extension.
    (!type && /\.(pdf|jpe?g|png|webp|heic|docx?)$/i.test(file.name));
  return okType ? null : "documents.errors.invalidType";
}

export type StaffDocument = {
  id: string;
  category: StaffDocumentCategory;
  title: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  expiresOn: string | null;
  notes: string | null;
  createdAt: string;
  owner: { id: string; name: string };
  /** The viewer may delete it (owner or Super Admin). */
  canDelete: boolean;
  /** Expired, or expiring within EXPIRY_WARNING_DAYS. */
  expiry: "expired" | "soon" | null;
  /** Days until expiry (negative once expired); null without an expiry date. */
  daysLeft: number | null;
};

export const EXPIRY_WARNING_DAYS = 30;
