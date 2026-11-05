import { z } from "zod";

import { isValidE164 } from "@/lib/utils/phone";
import { validationMessages } from "@/lib/validation/index";

export const emirates = [
  "abu_dhabi",
  "dubai",
  "sharjah",
  "ajman",
  "umm_al_quwain",
  "ras_al_khaimah",
  "fujairah",
] as const;

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, { error: validationMessages.required }),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, { error: validationMessages.required }),
  emirate: z.enum(emirates, { error: validationMessages.required }),
  city: z.string().trim().min(1, { error: validationMessages.required }),
  addressLine1: z.string().trim().min(1, { error: validationMessages.required }),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidE164(v), { error: "validation.phoneInternational" }),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.email({ error: validationMessages.email }).nullable()),
});

export type CreateBranchValues = z.input<typeof createBranchSchema>;

/** Same fields as creating a branch, plus whether it is still in use. */
export const updateBranchSchema = createBranchSchema.extend({ isActive: z.boolean() });

export type UpdateBranchValues = z.input<typeof updateBranchSchema>;
