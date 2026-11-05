import { z } from "zod";

import {
  DRIVE_TYPES,
  FUEL_TYPES,
  MILEAGE_UNITS,
  ORIGIN_TYPES,
  TRANSMISSION_TYPES,
  VEHICLE_MARKET_TYPES,
  VEHICLE_SORT_FIELDS,
  VEHICLE_STATUSES,
  type VehicleStatus,
} from "@/types/vehicle";
import { STOCK_AGE_KEYS } from "@/lib/vehicles/stock-age";

/** Local copies — avoid importing `@/lib/validation` (circular with index re-exports). */
const messages = {
  required: "validation.required",
  number: "validation.number",
  vin: "validation.vin",
  currency: "validation.currency",
  sellingBelowMinimum: "validation.sellingBelowMinimum",
} as const;

const currentYear = () => new Date().getUTCFullYear();

export const optionalVinSchema = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim().toUpperCase();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => value === null || /^[A-HJ-NPR-Z0-9]{17}$/.test(value), {
    error: messages.vin,
  });

export const optionalChassisSchema = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim().toUpperCase();
    return trimmed.length === 0 ? null : trimmed;
  });

const optionalText = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? null : trimmed;
  });

const optionalPositiveInt = z
  .union([z.number(), z.nan(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
  .refine((value) => value === null || (Number.isInteger(value) && value > 0), {
    error: messages.number,
  });

const optionalMoney = z
  .union([z.number(), z.nan(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
  .refine((value) => value === null || value >= 0, { error: messages.currency });

export const vehicleFormSchema = z.object({
  vin: optionalVinSchema,
  chassisNumber: optionalChassisSchema,
  make: z.string().trim().min(1, { error: messages.required }),
  model: z.string().trim().min(1, { error: messages.required }),
  variant: optionalText,
  year: z
    .number({ error: messages.number })
    .int()
    .min(1980, { error: messages.number })
    .max(currentYear() + 1, { error: messages.number }),
  mileage: z
    .number({ error: messages.number })
    .int()
    .min(0, { error: messages.number }),
  mileageUnit: z.enum(MILEAGE_UNITS),
  marketType: z.enum(VEHICLE_MARKET_TYPES),
  /** Create only: new vehicles start In transit (acquired) or Ready for sale. */
  initialStatus: z.enum(["acquired", "ready_for_sale"]).optional(),
  /** In transit only: visible to non-Super-Admin roles. */
  visibleToStaff: z.boolean().optional(),
  bodyType: optionalText,
  transmission: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.enum(TRANSMISSION_TYPES).nullable(),
  ),
  fuelType: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.enum(FUEL_TYPES).nullable(),
  ),
  engineSize: optionalText,
  engineCylinders: optionalPositiveInt,
  driveType: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.enum(DRIVE_TYPES).nullable(),
  ),
  seats: optionalPositiveInt,
  doors: optionalPositiveInt,
  exteriorColor: optionalText,
  interiorColor: optionalText,
  originType: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.enum(ORIGIN_TYPES).nullable(),
  ),
  countryOfOrigin: optionalText,
  branchId: z.string().uuid({ error: messages.required }),
  locationId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  purchaseDate: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null || value === "") return null;
      return String(value);
    }),
  registrationDate: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null || value === "") return null;
      return String(value);
    }),
  description: optionalText,
  makeId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  modelId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  modelYearId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  variantId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  customVariant: optionalText,
  /** Defaults to 1 when the key is omitted (older API callers); the form always sends it. */
  quantity: z
    .number({ error: messages.number })
    .int({ error: messages.number })
    .min(1, { error: messages.number })
    .default(1),
  /** Required while In transit (acquired); see vehicleFormRules. */
  portLocation: optionalText.optional(),
  /** Selling price section — only sent by users who can edit prices. */
  minimumSellingPrice: optionalMoney.optional(),
  targetSellingPrice: optionalMoney.optional(),
});

/**
 * Cross-field rules. `status` is the saved vehicle status (edit); on create the
 * chosen initialStatus wins. `requirePricing` is true when the user can edit prices.
 */
export function vehicleFormRules(options: { status?: VehicleStatus; requirePricing: boolean }) {
  return vehicleFormSchema.superRefine(
    (values, ctx) => {
      const status = values.initialStatus ?? options.status;
      if (status === "acquired" && !values.portLocation) {
        ctx.addIssue({ code: "custom", path: ["portLocation"], message: messages.required });
      }
      const minimum = values.minimumSellingPrice;
      if (options.requirePricing && minimum == null) {
        ctx.addIssue({ code: "custom", path: ["minimumSellingPrice"], message: messages.required });
      }
      const selling = values.targetSellingPrice;
      if (Number.isFinite(selling) && Number.isFinite(minimum) && selling! < minimum!) {
        ctx.addIssue({ code: "custom", path: ["targetSellingPrice"], message: messages.sellingBelowMinimum });
      }
    },
    // Run alongside field errors so the form shows every problem at once. Values for
    // fields that failed may be raw input, so the checks above tolerate any type.
    { when: (payload) => typeof payload.value === "object" && payload.value !== null },
  );
}

export const createVehicleSchema = vehicleFormSchema;

export const updateVehicleSchema = vehicleFormSchema;

/** Units to move on a multi-unit record; omitted means all of them. */
export const unitQuantitySchema = z
  .number({ error: messages.number })
  .int({ error: messages.number })
  .min(1, { error: messages.number })
  .optional();

export const changeVehicleStatusSchema = z.object({
  status: z.enum(VEHICLE_STATUSES),
  quantity: unitQuantitySchema,
  /** Optional in the app; the service records a default so status history always has one. */
  reason: z.string().trim().max(500).optional(),
});

export const transferVehicleSchema = z.object({
  branchId: z.string().uuid({ error: messages.required }),
  locationId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  reason: z.string().trim().min(1, { error: messages.required }).max(500),
});

export const archiveVehicleSchema = z.object({
  reason: z.string().trim().min(1, { error: messages.required }).max(500),
});

export const markReadyForSaleSchema = z
  .object({
    reason: z.string().trim().max(500).optional().nullable(),
    quantity: unitQuantitySchema,
    override: z.boolean().default(false),
    overrideReason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.override && (!value.overrideReason || value.overrideReason.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: messages.required,
      });
    }
  });

function emptyToUndefined(value: unknown) {
  if (value === "" || value == null) return undefined;
  return value;
}

function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(emptyToUndefined, z.enum(values).optional());
}

function optionalUuid() {
  return z.preprocess(emptyToUndefined, z.string().uuid().optional());
}

function optionalInt() {
  return z.preprocess((value) => {
    if (value === "" || value == null) return undefined;
    return value;
  }, z.coerce.number().int().optional());
}

function optionalNonNegInt() {
  return z.preprocess((value) => {
    if (value === "" || value == null) return undefined;
    return value;
  }, z.coerce.number().int().min(0).optional());
}

export const vehicleListQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().optional()).transform((value) => value ?? ""),
  status: optionalEnum(VEHICLE_STATUSES),
  marketType: optionalEnum(VEHICLE_MARKET_TYPES),
  branchId: optionalUuid(),
  locationId: optionalUuid(),
  make: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  model: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  yearFrom: optionalInt(),
  yearTo: optionalInt(),
  originType: optionalEnum(ORIGIN_TYPES),
  fuelType: optionalEnum(FUEL_TYPES),
  transmission: optionalEnum(TRANSMISSION_TYPES),
  bodyType: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  mileageMin: optionalNonNegInt(),
  mileageMax: optionalNonNegInt(),
  purchaseDateFrom: z.preprocess(emptyToUndefined, z.string().optional()),
  purchaseDateTo: z.preprocess(emptyToUndefined, z.string().optional()),
  stockAge: optionalEnum(STOCK_AGE_KEYS),
  includeArchived: z.preprocess(
    (value) => value === true || value === "true",
    z.boolean(),
  ).optional().default(false),
  sort: z.preprocess(emptyToUndefined, z.enum(VEHICLE_SORT_FIELDS).optional()).default("created_at"),
  order: z.preprocess(emptyToUndefined, z.enum(["asc", "desc"]).optional()).default("desc"),
  page: z.preprocess(
    (value) => (value === "" || value == null ? 1 : value),
    z.coerce.number().int().min(1),
  ).optional().default(1),
  pageSize: z.preprocess(
    (value) => (value === "" || value == null ? 25 : value),
    z.coerce
      .number()
      .int()
      .refine((value) => [25, 50, 100].includes(value), { error: messages.number }),
  ).optional().default(25),
});

export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;
export type CreateVehicleValues = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleValues = z.infer<typeof updateVehicleSchema>;
export type ChangeVehicleStatusValues = z.infer<typeof changeVehicleStatusSchema>;
export type TransferVehicleValues = z.infer<typeof transferVehicleSchema>;
export type ArchiveVehicleValues = z.infer<typeof archiveVehicleSchema>;
export type MarkReadyForSaleValues = z.infer<typeof markReadyForSaleSchema>;
export type VehicleListQuery = z.infer<typeof vehicleListQuerySchema>;
