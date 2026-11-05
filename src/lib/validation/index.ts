import { z } from "zod";

import { normalizeUaePhone } from "@/lib/utils/phone";

export const validationMessages = {
  required: "validation.required",
  email: "validation.email",
  passwordMin: "validation.passwordMin",
  passwordLower: "validation.passwordLower",
  passwordUpper: "validation.passwordUpper",
  passwordNumber: "validation.passwordNumber",
  phone: "validation.phone",
  number: "validation.number",
  currency: "validation.currency",
  date: "validation.date",
  vin: "validation.vin",
  passwordMatch: "validation.passwordMatch",
} as const;

export const emailSchema = z
  .string()
  .trim()
  .min(1, { error: validationMessages.required })
  .pipe(z.email({ error: validationMessages.email }));

export const passwordSchema = z
  .string()
  .min(8, { error: validationMessages.passwordMin })
  .regex(/[a-z]/, { error: validationMessages.passwordLower })
  .regex(/[A-Z]/, { error: validationMessages.passwordUpper })
  .regex(/[0-9]/, { error: validationMessages.passwordNumber });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: validationMessages.required }),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, { error: validationMessages.required }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: validationMessages.passwordMatch,
    path: ["confirmPassword"],
  });

export const bootstrapAdminSchema = z
  .object({
    secret: z.string().min(1, { error: validationMessages.required }),
    firstName: z.string().trim().min(1, { error: validationMessages.required }),
    lastName: z.string().trim().min(1, { error: validationMessages.required }),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, { error: validationMessages.required }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: validationMessages.passwordMatch,
    path: ["confirmPassword"],
  });

export const uaePhoneSchema = z
  .string()
  .trim()
  .min(1, { error: validationMessages.required })
  .transform((value, ctx) => {
    const normalized = normalizeUaePhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: validationMessages.phone,
      });
      return z.NEVER;
    }
    return normalized;
  });

export const currencyAmountSchema = z
  .number({ error: validationMessages.number })
  .finite(validationMessages.number)
  .nonnegative(validationMessages.currency);

export const dateSchema = z.date({ error: validationMessages.date });

export const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, { error: validationMessages.vin });

export type LoginValues = z.infer<typeof loginSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type BootstrapAdminValues = z.infer<typeof bootstrapAdminSchema>;

export {
  vehicleFormSchema,
  createVehicleSchema,
  updateVehicleSchema,
  changeVehicleStatusSchema,
  transferVehicleSchema,
  archiveVehicleSchema,
  vehicleListQuerySchema,
  optionalVinSchema,
} from "@/lib/validation/vehicle";

export type {
  VehicleFormValues,
  CreateVehicleValues,
  UpdateVehicleValues,
  ChangeVehicleStatusValues,
  TransferVehicleValues,
  ArchiveVehicleValues,
  VehicleListQuery,
} from "@/lib/validation/vehicle";

export {
  acquisitionFormSchema,
  createAcquisitionSchema,
  updateAcquisitionSchema,
  changeAcquisitionStatusSchema,
  approveAcquisitionSchema,
  rejectAcquisitionSchema,
  cancelAcquisitionSchema,
  receiveAcquisitionSchema,
  acquisitionExpenseSchema,
  acquisitionListQuerySchema,
} from "@/lib/validation/acquisition";

export type {
  AcquisitionFormValues,
  CreateAcquisitionValues,
  UpdateAcquisitionValues,
  ChangeAcquisitionStatusValues,
  ApproveAcquisitionValues,
  RejectAcquisitionValues,
  CancelAcquisitionValues,
  ReceiveAcquisitionValues,
  AcquisitionExpenseValues,
  AcquisitionListQuery,
} from "@/lib/validation/acquisition";
export function firstFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
