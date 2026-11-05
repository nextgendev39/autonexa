/** General vehicle photos (inventory). Not inspection or workshop evidence. */

export const VEHICLE_PHOTO_CATEGORIES = [
  "front",
  "rear",
  "left",
  "right",
  "interior",
  "dashboard",
  "odometer",
  "engine",
  "tyres",
  "vin",
  "damage",
  "other",
] as const;

export type VehiclePhotoCategory = (typeof VEHICLE_PHOTO_CATEGORIES)[number];

/** Gallery filter groups for vehicle detail. */
export const VEHICLE_PHOTO_FILTERS = [
  "all",
  "exterior",
  "interior",
  "engine",
  "damage",
  "other",
] as const;

export type VehiclePhotoFilter = (typeof VEHICLE_PHOTO_FILTERS)[number];

export const VEHICLE_PHOTO_FILTER_CATEGORIES: Record<
  Exclude<VehiclePhotoFilter, "all">,
  readonly VehiclePhotoCategory[]
> = {
  exterior: ["front", "rear", "left", "right"],
  interior: ["interior", "dashboard", "odometer"],
  engine: ["engine"],
  damage: ["damage"],
  other: ["tyres", "vin", "other"],
};

export const VEHICLE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const VEHICLE_PHOTO_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type VehiclePhoto = {
  id: string;
  vehicleId: string;
  category: VehiclePhotoCategory;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  sortOrder: number;
  isPrimary: boolean;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
  url: string | null;
};

export type PendingVehiclePhoto = {
  localId: string;
  file: File;
  previewUrl: string;
  category: VehiclePhotoCategory;
  isPrimary: boolean;
  status?: "ready" | "uploading" | "saving" | "error";
  progress?: number;
  errorMessage?: string;
};
