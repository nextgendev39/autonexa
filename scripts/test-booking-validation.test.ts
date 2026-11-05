/**
 * Booking forms: required selling price, no hold-until date, and the edit action.
 * Run: npx tsx --test scripts/test-booking-validation.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { firstFieldErrors } from "../src/lib/validation";
import { bookingActionSchema, createBookingSchema } from "../src/lib/validation/booking";

const base = {
  vehicleId: "00000000-0000-4000-8000-000000000001",
  customerMode: "existing",
  customerId: "00000000-0000-4000-8000-000000000002",
  deposit: 5000,
  sellingPrice: 150000,
};

const errors = (input: Record<string, unknown>) => {
  const parsed = createBookingSchema.safeParse(input);
  return parsed.success ? {} : firstFieldErrors(parsed.error);
};

test("a booking needs no hold-until date", () => {
  assert.deepEqual(errors(base), {});
});

test("selling price is required", () => {
  const withoutPrice: Record<string, unknown> = { ...base };
  delete withoutPrice.sellingPrice;
  assert.equal(errors(withoutPrice).sellingPrice, "validation.required");
  // An empty input is sent as NaN.
  assert.equal(errors({ ...base, sellingPrice: Number.NaN }).sellingPrice, "validation.required");
});

test("selling price must be a non-negative amount", () => {
  assert.equal(errors({ ...base, sellingPrice: -1 }).sellingPrice, "validation.currency");
  assert.equal(errors({ ...base, sellingPrice: 0 }).sellingPrice, undefined);
});

test("edit action takes deposit, selling price and notes", () => {
  const ok = bookingActionSchema.safeParse({ action: "edit", deposit: 2000, sellingPrice: 148000, notes: "Agreed" });
  assert.ok(ok.success);

  const missing = bookingActionSchema.safeParse({ action: "edit", deposit: 2000 });
  assert.ok(!missing.success);
  assert.equal(firstFieldErrors(missing.error).sellingPrice, "validation.required");

  const negative = bookingActionSchema.safeParse({ action: "edit", deposit: -5, sellingPrice: 1 });
  assert.ok(!negative.success);
  assert.equal(firstFieldErrors(negative.error).deposit, "validation.currency");
});

test("booking quantity is an optional whole number of at least 1", () => {
  assert.deepEqual(errors({ ...base, quantity: 2 }), {});
  assert.equal(errors({ ...base, quantity: 0 }).quantity, "validation.number");
  assert.equal(errors({ ...base, quantity: 1.5 }).quantity, "validation.number");
});

test("deposit is optional and defaults to 0", () => {
  const withoutDeposit: Record<string, unknown> = { ...base };
  delete withoutDeposit.deposit;
  const created = createBookingSchema.safeParse(withoutDeposit);
  assert.equal(created.success, true);
  assert.equal(created.success && created.data.deposit, 0);

  const edited = bookingActionSchema.safeParse({ action: "edit", sellingPrice: 148000 });
  assert.equal(edited.success, true);
  assert.equal(edited.success && edited.data.action === "edit" && edited.data.deposit, 0);
});
