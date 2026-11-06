import { z } from "zod";

import { isValidE164 } from "@/lib/utils/phone";

export const enquirySchema = z.object({
  kind: z.enum(["enquiry", "booking_request"]),
  stockNumber: z.string().trim().max(60).optional().nullable(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().refine(isValidE164, { error: "validation.phoneInternational" }),
  email: z.email().max(200).optional().nullable().or(z.literal("")),
  message: z.string().trim().max(2000).optional().nullable(),
  locale: z.enum(["en", "ar"]).default("en"),
  /** Left empty by people. Bots fill in every field they find. */
  website: z.string().max(200).optional(),
});

export const publishSchema = z.object({ action: z.enum(["publish", "unpublish"]) });
/** Listing on or off, and what the listing says. Send any of them; the rest is left as it is. */
export const vehicleListingSchema = z
  .object({
    published: z.boolean().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    features: z.array(z.string().trim().max(80)).max(40).optional(),
  })
  .refine(
    (value) =>
      value.published !== undefined ||
      value.description !== undefined ||
      value.features !== undefined,
  )
  // The text and the features are saved together, so sending one can't wipe the other.
  .refine((value) => (value.description === undefined) === (value.features === undefined));
export const storefrontDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
});
export const enquiryStatusSchema = z.object({ status: z.enum(["new", "contacted", "closed"]) });
export const confirmBookingSchema = z.object({
  sellingPrice: z.number().nonnegative().finite(),
  deposit: z.number().nonnegative().finite().default(0),
  salespersonId: z.uuid().optional(),
});
export const storefrontToggleSchema = z.object({
  disabled: z.boolean(),
  reason: z.string().trim().max(500).optional().nullable(),
});
