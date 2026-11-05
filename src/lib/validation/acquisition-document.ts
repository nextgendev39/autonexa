import { z } from "zod";

import {
  ACQUISITION_DOCUMENT_ALLOWED_MIME,
  ACQUISITION_DOCUMENT_CATEGORIES,
  ACQUISITION_DOCUMENT_MAX_BYTES,
} from "@/types/acquisition-document";

export const acquisitionDocumentCategorySchema = z.enum(ACQUISITION_DOCUMENT_CATEGORIES);

export const addAcquisitionDocumentSchema = z.object({
  storagePath: z.string().trim().min(1).max(500),
  category: acquisitionDocumentCategorySchema,
  title: z.string().trim().max(255).optional().nullable(),
  fileName: z.string().trim().min(1).max(255),
  originalFileName: z.string().trim().max(255).optional().nullable(),
  mimeType: z.string().trim().max(100).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  clientRequestId: z.string().uuid().optional(),
});

export const replaceAcquisitionDocumentSchema = z.object({
  storagePath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  originalFileName: z.string().trim().max(255).optional().nullable(),
  mimeType: z.string().trim().max(100).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  title: z.string().trim().max(255).optional().nullable(),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateAcquisitionDocumentMetaSchema = z
  .object({
    title: z.string().trim().max(255).optional().nullable(),
    referenceNumber: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    category: acquisitionDocumentCategorySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "validation.required",
  });

export type AddAcquisitionDocumentValues = z.infer<typeof addAcquisitionDocumentSchema>;
export type ReplaceAcquisitionDocumentValues = z.infer<typeof replaceAcquisitionDocumentSchema>;
export type UpdateAcquisitionDocumentMetaValues = z.infer<
  typeof updateAcquisitionDocumentMetaSchema
>;

export function validateAcquisitionDocumentFile(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  const allowed = ACQUISITION_DOCUMENT_ALLOWED_MIME as readonly string[];
  const okMime =
    allowed.includes(mime) ||
    mime === "image/jpg" ||
    mime.startsWith("image/jpeg") ||
    mime.startsWith("image/png") ||
    mime.startsWith("image/webp") ||
    mime === "application/pdf";

  if (!okMime) {
    return "acquisitions.documents.errors.invalidType";
  }
  if (file.size > ACQUISITION_DOCUMENT_MAX_BYTES) {
    return "acquisitions.documents.errors.tooLarge";
  }
  return null;
}
