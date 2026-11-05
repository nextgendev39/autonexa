import { z } from "zod";

import { validationMessages } from "@/lib/validation/index";

/** Booking payment deadlines in minutes, counted from the booking's date and time. */
export type PaymentTerms = { depositMinutes: number; balanceMinutes: number };

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
export const MAX_TERM_MINUTES = 365 * MINUTES_PER_DAY;

export const DEFAULT_PAYMENT_TERMS: PaymentTerms = {
  depositMinutes: 3 * MINUTES_PER_DAY,
  balanceMinutes: 7 * MINUTES_PER_DAY,
};

export const PAYMENT_TERM_KEYS = {
  depositMinutes: "booking.deposit_minutes",
  balanceMinutes: "booking.balance_minutes",
} as const;

const minutes = z
  .number({ error: validationMessages.number })
  .int({ error: validationMessages.number })
  .min(1, { error: "settings.paymentTerms.errors.range" })
  .max(MAX_TERM_MINUTES, { error: "settings.paymentTerms.errors.range" });

export const paymentTermsSchema = z
  .object({ depositMinutes: minutes, balanceMinutes: minutes })
  .refine((value) => value.balanceMinutes >= value.depositMinutes, {
    path: ["balanceMinutes"],
    error: "settings.paymentTerms.errors.balanceBeforeDeposit",
  });

export type PaymentTermsValues = z.infer<typeof paymentTermsSchema>;

export type DurationParts = { days: number; hours: number; minutes: number };

export function splitMinutes(total: number): DurationParts {
  return {
    days: Math.floor(total / MINUTES_PER_DAY),
    hours: Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: total % MINUTES_PER_HOUR,
  };
}

export function joinMinutes({ days, hours, minutes }: DurationParts) {
  return days * MINUTES_PER_DAY + hours * MINUTES_PER_HOUR + minutes;
}

/** When a deadline that counts from the booking date and time falls. */
export function deadlineFrom(reservedAt: string, minutes: number) {
  return new Date(new Date(reservedAt).getTime() + minutes * 60_000).toISOString();
}
