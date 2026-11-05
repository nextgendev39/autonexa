import { z } from "zod";

import { isValidE164 } from "@/lib/utils/phone";
import { validationMessages } from "@/lib/validation/index";

const required = z.string().trim().min(1, { error: validationMessages.required });

const bookingAmounts = {
  /** Optional: a booking can be made before any deposit is received (0 = none yet). */
  deposit: z
    .number({ error: validationMessages.number })
    .finite({ error: validationMessages.number })
    .nonnegative({ error: validationMessages.currency })
    .default(0),
  /** Agreed price for the car; the server checks it against the minimum selling price. */
  sellingPrice: z
    .number({ error: validationMessages.required })
    .finite({ error: validationMessages.required })
    .nonnegative({ error: validationMessages.currency }),
};

export const createBookingSchema = z
  .object({
    vehicleId: z.string().uuid({ error: validationMessages.required }),
    customerMode: z.enum(["existing", "new"]),
    customerId: z.string().optional(),
    salespersonId: z.string().optional(),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    ...bookingAmounts,
    /** Units to book on a multi-unit record; omitted means all of them. */
    quantity: z
      .number({ error: validationMessages.number })
      .int({ error: validationMessages.number })
      .min(1, { error: validationMessages.number })
      .optional(),
    notes: z.string().trim().max(1000).optional(),
    /** Sell the car now (paid in full) instead of booking it. */
    sell: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.customerMode === "existing") {
      if (!value.customerId || !z.string().uuid().safeParse(value.customerId).success) {
        ctx.addIssue({ code: "custom", path: ["customerId"], message: validationMessages.required });
      }
      return;
    }
    for (const key of ["firstName", "lastName"] as const) {
      if (!required.safeParse(value[key] ?? "").success) {
        ctx.addIssue({ code: "custom", path: [key], message: validationMessages.required });
      }
    }
    if (!value.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: validationMessages.required });
    } else if (!isValidE164(value.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "validation.phoneInternational" });
    }
  });


export const editBookingSchema = z.object({
  ...bookingAmounts,
  notes: z.string().trim().max(1000).optional(),
});

/** How a received deposit goes back to the customer when the booking is cancelled. */
export const REFUND_METHODS = ["cash", "bank_transfer", "card", "other"] as const;

export const depositRefundSchema = z.object({
  /** Up to the deposit; less when part of it is kept (the server checks the upper bound). */
  amount: z
    .number({ error: validationMessages.number })
    .finite({ error: validationMessages.number })
    .nonnegative({ error: validationMessages.currency }),
  method: z.enum(REFUND_METHODS, { error: validationMessages.required }),
  reference: z.string().trim().max(200).optional(),
});

export type DepositRefundValues = z.infer<typeof depositRefundSchema>;

export const bookingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().max(500).optional(),
    /** Required when the booking has a deposit. */
    refund: depositRefundSchema.optional(),
  }),
  /** Selling records the full balance as received; the server works it out. */
  z.object({ action: z.literal("sold") }),
  editBookingSchema.extend({ action: z.literal("edit") }),
  /** No deposit yet: the sales executive asks a Super Admin to keep the booking from auto-cancelling. */
  z.object({
    action: z.literal("request_hold"),
    reason: required.max(500, { error: validationMessages.required }),
  }),
  /** Super Admin decision on a pending cancellation hold. */
  z.object({
    action: z.literal("review_hold"),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional(),
  }),
]);

export type CreateBookingValues = z.infer<typeof createBookingSchema>;
export type BookingActionValues = z.infer<typeof bookingActionSchema>;
