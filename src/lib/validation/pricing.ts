import { z } from "zod";

import { PRICING_CHANGE_REASONS, PRICING_STATUSES } from "@/types/pricing";

const messages = {
  required: "validation.required",
  number: "validation.number",
} as const;

const money = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return value;
}, z.coerce.number().min(0, { error: messages.number }).nullable());

const percent = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return value;
}, z.coerce.number().min(0).max(100).nullable());

export const upsertPricingSchema = z
  .object({
    minimumSellingPrice: money,
    targetSellingPrice: money,
    advertisedPrice: money,
    currentSellingPrice: money,
    maximumDiscountAmount: money,
    maximumDiscountPercent: percent,
    pricingNotes: z.string().trim().max(2000).optional().nullable(),
    changeReason: z.enum(PRICING_CHANGE_REASONS).default("other"),
    changeNotes: z.string().trim().max(1000).optional().nullable(),
    overrideMinimum: z.boolean().default(false),
    overrideReason: z.string().trim().max(500).optional().nullable(),
    submitForApproval: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (
      value.minimumSellingPrice != null &&
      value.targetSellingPrice != null &&
      value.minimumSellingPrice > value.targetSellingPrice
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minimumSellingPrice"],
        message: "pricing.validation.minExceedsTarget",
      });
    }
    if (
      value.advertisedPrice != null &&
      value.currentSellingPrice != null &&
      value.currentSellingPrice > value.advertisedPrice
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["currentSellingPrice"],
        message: "pricing.validation.currentExceedsAdvertised",
      });
    }
    if (
      value.maximumDiscountAmount != null &&
      value.targetSellingPrice != null &&
      value.maximumDiscountAmount > value.targetSellingPrice
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["maximumDiscountAmount"],
        message: "pricing.validation.discountExceedsTarget",
      });
    }
    if (
      value.overrideMinimum &&
      (!value.overrideReason || value.overrideReason.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: messages.required,
      });
    }
  });

export const approvePricingSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const pricingListQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  branchId: z.string().uuid().optional(),
  pricingStatus: z.enum(PRICING_STATUSES).optional(),
  vehicleStatus: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().refine((v) => [25, 50, 100].includes(v)).optional().default(25),
});

export type UpsertPricingValues = z.infer<typeof upsertPricingSchema>;
export type ApprovePricingValues = z.infer<typeof approvePricingSchema>;
export type PricingListQuery = z.infer<typeof pricingListQuerySchema>;

/** Coerce form/number-input values to a finite money amount or null. */
export function parseMoneyInput(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Maximum discount as a percentage of the target selling price (2 decimals), or null
 * when either is missing. The amount is entered; the percentage is always derived.
 */
export function maxDiscountPercentFrom(amount: unknown, targetPrice: unknown): number | null {
  const discount = parseMoneyInput(amount);
  const target = parseMoneyInput(targetPrice);
  if (discount == null || target == null || target <= 0) return null;
  return Math.min(100, Number(((discount / target) * 100).toFixed(2)));
}

/** Client-side live calculator (server recalculates authoritatively). */
export function calculatePricingPreview(input: {
  totalVehicleCost: number;
  currentSellingPrice: number | null;
  minimumSellingPrice: number | null;
}) {
  const sell = parseMoneyInput(input.currentSellingPrice);
  const minimum = parseMoneyInput(input.minimumSellingPrice);
  const profit =
    sell == null ? null : Number((sell - input.totalVehicleCost).toFixed(2));
  const margin =
    sell == null || sell <= 0 || profit == null
      ? null
      : Number(((profit / sell) * 100).toFixed(2));
  const belowMinimum = sell != null && minimum != null && sell < minimum;

  return {
    expectedGrossProfit: profit,
    expectedMarginPercent: margin,
    belowMinimum,
    isLoss: profit != null && profit < 0,
  };
}
