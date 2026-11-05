import { z } from "zod";

import {
  ACQUISITION_DOCUMENT_STATUSES,
  ACQUISITION_EXPENSE_TYPES,
  ACQUISITION_PAYMENT_STATUSES,
  ACQUISITION_REGISTRATION_STATUSES,
  ACQUISITION_SORT_FIELDS,
  ACQUISITION_SOURCE_TYPES,
  ACQUISITION_STATUSES,
} from "@/types/acquisition";
import { isValidE164 } from "@/lib/utils/phone";
import { optionalChassisSchema, optionalVinSchema } from "@/lib/validation/vehicle";

const messages = {
  required: "validation.required",
  number: "validation.number",
  currency: "validation.currency",
  date: "validation.date",
  email: "validation.email",
  phone: "validation.phoneInternational",
} as const;

const optionalText = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? null : trimmed;
  });

const optionalPhone = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (trimmed.length === 0) return null;
    if (!isValidE164(trimmed)) {
      ctx.addIssue({ code: "custom", message: messages.phone });
      return z.NEVER;
    }
    return trimmed;
  });

const optionalEmail = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    error: messages.email,
  });

const moneySchema = z
  .union([z.number(), z.nan(), z.null(), z.undefined(), z.string()])
  .transform((value) => {
    if (value == null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  })
  .refine((value) => value === null || value >= 0, { error: messages.currency });

const requiredMoneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : NaN;
  })
  .refine((value) => Number.isFinite(value) && value >= 0, { error: messages.currency });

const optionalDate = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? null : trimmed;
  });

const currencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .default("AED");

const currentYear = () => new Date().getUTCFullYear();

/** Vehicle fields without refinements — safe for `.partial()` on update. */
export const acquisitionVehicleFieldsSchema = z.object({
  vehicleId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  vin: optionalVinSchema,
  chassisNumber: optionalChassisSchema,
  make: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return "";
      return String(value).trim();
    }),
  model: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return "";
      return String(value).trim();
    }),
  variant: optionalText,
  year: z
    .union([z.number(), z.nan(), z.null(), z.undefined(), z.string()])
    .transform((value) => {
      if (value == null || value === "") return null;
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }),
  mileage: z
    .union([z.number(), z.nan(), z.null(), z.undefined(), z.string()])
    .transform((value) => {
      if (value == null || value === "") return 0;
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : 0;
    }),
  originType: z.preprocess(
    (value) => (value === "" || value == null ? "unknown" : value),
    z.enum(["gcc", "imported", "unknown"]),
  ),
  countryOfOrigin: optionalText,
  makeId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  modelId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
});

export const acquisitionFormFieldsSchema = z.object({
  branchId: z.string().uuid({ error: messages.required }),
  sourceType: z.enum(ACQUISITION_SOURCE_TYPES),
  sourceName: optionalText,
  sourceCompany: optionalText,
  sourcePhone: optionalPhone,
  sourceEmail: optionalEmail,
  sourceReference: optionalText,
  lotNumber: optionalText,
  supplierId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  customerId: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value && String(value).length > 0 ? String(value) : null)),
  askingPrice: moneySchema,
  purchasePrice: requiredMoneySchema,
  /** Saved as the acquisition's single Transport / Other expense line (see syncFormExpenses). */
  shippingCost: moneySchema,
  otherFees: moneySchema,
  currency: currencyCodeSchema,
  purchaseDate: optionalDate,
  expectedArrivalDate: optionalDate,
  paymentStatus: z.enum(ACQUISITION_PAYMENT_STATUSES).default("not_paid"),
  registrationStatus: z.enum(ACQUISITION_REGISTRATION_STATUSES).default("not_started"),
  documentStatus: z.enum(ACQUISITION_DOCUMENT_STATUSES).default("pending"),
  notes: optionalText,
  vehicle: acquisitionVehicleFieldsSchema,
});

function applyAcquisitionBusinessRules(
  value: z.infer<typeof acquisitionFormFieldsSchema>,
  ctx: z.RefinementCtx,
) {
  if (
    value.purchaseDate &&
    value.expectedArrivalDate &&
    value.expectedArrivalDate < value.purchaseDate
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedArrivalDate"],
      message: messages.date,
    });
  }

  if (value.sourceType === "auction") {
    if (!value.sourceName) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceName"],
        message: messages.required,
      });
    }
  }

  if (value.sourceType === "individual_owner" && !value.sourceName) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceName"],
      message: messages.required,
    });
  }
}

export const acquisitionFormSchema = acquisitionFormFieldsSchema.superRefine((value, ctx) => {
  // Linking an existing inventory vehicle only requires vehicleId.
  if (!value.vehicle.vehicleId) {
    if (!value.vehicle.make) {
      ctx.addIssue({ code: "custom", path: ["vehicle", "make"], message: messages.required });
    }
    if (!value.vehicle.model) {
      ctx.addIssue({ code: "custom", path: ["vehicle", "model"], message: messages.required });
    }
    if (
      value.vehicle.year == null ||
      !Number.isInteger(value.vehicle.year) ||
      value.vehicle.year < 1980 ||
      value.vehicle.year > currentYear() + 1
    ) {
      ctx.addIssue({ code: "custom", path: ["vehicle", "year"], message: messages.number });
    }
    if (!Number.isInteger(value.vehicle.mileage) || value.vehicle.mileage < 0) {
      ctx.addIssue({ code: "custom", path: ["vehicle", "mileage"], message: messages.number });
    }
  }

  applyAcquisitionBusinessRules(value, ctx);
});

/**
 * Same acquisition fields/rules as the standalone form, but vehicle identity is owned by
 * Inventory — parent supplies vehicleId after the vehicle is saved.
 */
export const acquisitionEmbeddedFormSchema = acquisitionFormFieldsSchema.superRefine(
  (value, ctx) => {
    applyAcquisitionBusinessRules(value, ctx);
  },
);

/** Full vehicle schema with create-time identity rules (for callers that validate vehicle alone). */
export const acquisitionVehicleSchema = acquisitionVehicleFieldsSchema.superRefine(
  (value, ctx) => {
    if (value.vehicleId) return;

    if (!value.make) {
      ctx.addIssue({ code: "custom", path: ["make"], message: messages.required });
    }
    if (!value.model) {
      ctx.addIssue({ code: "custom", path: ["model"], message: messages.required });
    }
    if (
      value.year == null ||
      !Number.isInteger(value.year) ||
      value.year < 1980 ||
      value.year > currentYear() + 1
    ) {
      ctx.addIssue({ code: "custom", path: ["year"], message: messages.number });
    }
    if (!Number.isInteger(value.mileage) || value.mileage < 0) {
      ctx.addIssue({ code: "custom", path: ["mileage"], message: messages.number });
    }
  },
);

export const createAcquisitionSchema = acquisitionFormSchema;
export const updateAcquisitionSchema = acquisitionFormFieldsSchema.partial().extend({
  vehicle: acquisitionVehicleFieldsSchema.partial().optional(),
});

export const changeAcquisitionStatusSchema = z.object({
  status: z.enum(ACQUISITION_STATUSES),
  reason: z.string().trim().min(1, { error: messages.required }).max(500),
});

export const approveAcquisitionSchema = z.object({
  note: optionalText,
});

export const rejectAcquisitionSchema = z.object({
  reason: z.string().trim().min(1, { error: messages.required }).max(500),
});

export const cancelAcquisitionSchema = z.object({
  reason: z.string().trim().min(1, { error: messages.required }).max(500),
});

export const receiveAcquisitionSchema = z.object({
  reason: optionalText,
});

export const acquisitionExpenseSchema = z.object({
  expenseType: z.enum(ACQUISITION_EXPENSE_TYPES),
  description: optionalText,
  amount: requiredMoneySchema,
  currency: currencyCodeSchema,
  expenseDate: z.string().trim().min(1, { error: messages.required }),
  vendor: optionalText,
  reference: optionalText,
});

export const acquisitionListQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  status: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(ACQUISITION_STATUSES).optional(),
  ),
  branchId: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().uuid().optional(),
  ),
  sourceType: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(ACQUISITION_SOURCE_TYPES).optional(),
  ),
  make: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  model: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  purchaseDateFrom: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  purchaseDateTo: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  createdFrom: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  createdTo: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  paymentStatus: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(ACQUISITION_PAYMENT_STATUSES).optional(),
  ),
  documentStatus: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(ACQUISITION_DOCUMENT_STATUSES).optional(),
  ),
  registrationStatus: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(ACQUISITION_REGISTRATION_STATUSES).optional(),
  ),
  priceMin: z.coerce.number().nonnegative().optional().catch(undefined),
  priceMax: z.coerce.number().nonnegative().optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => [25, 50, 100].includes(value), { error: messages.number })
    .default(25),
  sort: z.enum(ACQUISITION_SORT_FIELDS).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type AcquisitionFormValues = z.infer<typeof acquisitionFormSchema>;
export type CreateAcquisitionValues = z.infer<typeof createAcquisitionSchema>;
export type UpdateAcquisitionValues = z.infer<typeof updateAcquisitionSchema>;
export type ChangeAcquisitionStatusValues = z.infer<typeof changeAcquisitionStatusSchema>;
export type ApproveAcquisitionValues = z.infer<typeof approveAcquisitionSchema>;
export type RejectAcquisitionValues = z.infer<typeof rejectAcquisitionSchema>;
export type CancelAcquisitionValues = z.infer<typeof cancelAcquisitionSchema>;
export type ReceiveAcquisitionValues = z.infer<typeof receiveAcquisitionSchema>;
export type AcquisitionExpenseValues = z.infer<typeof acquisitionExpenseSchema>;
export type AcquisitionListQuery = z.infer<typeof acquisitionListQuerySchema>;
