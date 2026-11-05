import { z } from "zod";

import {
  VEHICLE_PHOTO_ALLOWED_MIME,
  VEHICLE_PHOTO_CATEGORIES,
  VEHICLE_PHOTO_MAX_BYTES,
} from "@/types/vehicle-photo";

export const vehiclePhotoCategorySchema = z.enum(VEHICLE_PHOTO_CATEGORIES);

export const addVehiclePhotoSchema = z.object({
  storagePath: z.string().trim().min(1).max(500),
  category: vehiclePhotoCategorySchema.default("other"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(100).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  isPrimary: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional(),
});

export const addVehiclePhotosSchema = z.object({
  photos: z.array(addVehiclePhotoSchema).min(1).max(100),
});

export const updateVehiclePhotoSchema = z
  .object({
    category: vehiclePhotoCategorySchema.optional(),
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    storagePath: z.string().trim().min(1).max(500).optional(),
    fileName: z.string().trim().min(1).max(255).optional(),
    mimeType: z.string().trim().max(100).nullable().optional(),
    fileSize: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "validation.required",
  });

export const reorderVehiclePhotosSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});

export const deleteVehiclePhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(200),
});

export type AddVehiclePhotoValues = z.infer<typeof addVehiclePhotoSchema>;
export type AddVehiclePhotosValues = z.infer<typeof addVehiclePhotosSchema>;
export type UpdateVehiclePhotoValues = z.infer<typeof updateVehiclePhotoSchema>;
export type DeleteVehiclePhotosValues = z.infer<typeof deleteVehiclePhotosSchema>;
export type ReorderVehiclePhotosValues = z.infer<typeof reorderVehiclePhotosSchema>;

export function validateVehiclePhotoFile(file: File): string | null {
  const mime = file.type.toLowerCase();
  if (
    !(VEHICLE_PHOTO_ALLOWED_MIME as readonly string[]).includes(mime) &&
    !mime.startsWith("image/jpeg") &&
    !mime.startsWith("image/png") &&
    !mime.startsWith("image/webp") &&
    !mime.startsWith("image/heic") &&
    !mime.startsWith("image/heif")
  ) {
    return "inventory.photos.errors.invalidType";
  }
  if (file.size > VEHICLE_PHOTO_MAX_BYTES) {
    return "inventory.photos.errors.tooLarge";
  }
  return null;
}
