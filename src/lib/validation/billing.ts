import { z } from "zod";

/** Nothing here carries a price, tax, status or dealership. The server works all of those out. */
export const checkoutSchema = z.union([
  z.object({ planId: z.uuid(), cycle: z.enum(["monthly", "yearly"]) }),
  z.object({ invoiceId: z.uuid() }),
]);

export const scheduleSchema = z.object({
  planId: z.uuid().nullable(),
  cycle: z.enum(["monthly", "yearly"]).nullable(),
});

export const cancelSchema = z.object({ cancel: z.boolean() });

export const billingProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().regex(/^[A-Z]{2}$/),
  currency: z.enum(["AED", "INR"]),
  email: z.email().max(200).optional().nullable().or(z.literal("")),
});
