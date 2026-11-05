import { z } from "zod";

import { isValidE164 } from "@/lib/utils/phone";
import { passwordSchema, validationMessages } from "@/lib/validation/index";

const name = z.string().trim().min(1, { error: validationMessages.required }).max(100);

/** What staff may change about themselves. Email, role, branch and status stay with admins. */
export const updateProfileSchema = z.object({
  firstName: name,
  lastName: name,
  /** Optional: blank clears it. Shown to customers on shared car links. */
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidE164(value), {
      error: "validation.phoneInternational",
    }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: validationMessages.required }),
    password: passwordSchema,
    confirmPassword: z.string().min(1, { error: validationMessages.required }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: validationMessages.passwordMatch,
    path: ["confirmPassword"],
  })
  .refine((value) => value.password !== value.currentPassword, {
    error: "profile.password.samePassword",
    path: ["password"],
  });

export type UpdateProfileValues = z.infer<typeof updateProfileSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
