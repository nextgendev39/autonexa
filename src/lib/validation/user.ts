import { z } from "zod";
import { emailSchema, validationMessages } from "@/lib/validation/index";

export const inviteUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1, { error: validationMessages.required }),
  lastName: z.string().trim().min(1, { error: validationMessages.required }),
  roleKey: z.string().min(1, { error: validationMessages.required }),
});

// "invited" is excluded: it is only set by the invite flow and cleared by verification.
export const editableUserStatuses = ["active", "suspended", "disabled"] as const;
export const editableUserStatusSchema = z.enum(editableUserStatuses, { error: validationMessages.required });

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: z.string().trim().min(1, { error: validationMessages.required }).optional(),
  lastName: z.string().trim().min(1, { error: validationMessages.required }).optional(),
  roleKey: z.string().min(1, { error: validationMessages.required }).optional(),
  status: editableUserStatusSchema.optional(),
});

export const editUserFormSchema = inviteUserSchema.extend({
  status: z.enum(["invited", ...editableUserStatuses], { error: validationMessages.required }),
});

export type InviteUserValues = z.infer<typeof inviteUserSchema>;
export type UpdateUserValues = z.infer<typeof updateUserSchema>;
