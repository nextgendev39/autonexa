import { z } from "zod";

import { isValidE164 } from "@/lib/utils/phone";
import { validationMessages } from "@/lib/validation/index";

const required = z.string().trim().min(1, { error: validationMessages.required }).max(100);

/** Contact details a Super Admin or the customer's creator can correct. */
export const editCustomerSchema = z.object({
  firstName: required,
  lastName: required,
  phone: z
    .string()
    .trim()
    .min(1, { error: validationMessages.required })
    .refine(isValidE164, { error: "validation.phoneInternational" }),
  /** Optional: blank clears it. */
  email: z
    .string()
    .trim()
    .max(254)
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      error: validationMessages.email,
    }),
  city: z.string().trim().max(100),
});

export type EditCustomerValues = z.infer<typeof editCustomerSchema>;
