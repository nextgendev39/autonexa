/**
 * Booking deposit exception (cancellation hold): request/review validation and which hold
 * states stop the deposit deadline (mirrors public.cancel_unpaid_bookings).
 * Run: npx tsx --test scripts/test-booking-cancellation-hold.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { holdsDeadline } from "../src/lib/bookings/cancellation-hold";
import { firstFieldErrors } from "../src/lib/validation";
import { bookingActionSchema } from "../src/lib/validation/booking";

const errors = (input: Record<string, unknown>) => {
  const parsed = bookingActionSchema.safeParse(input);
  return parsed.success ? {} : firstFieldErrors(parsed.error);
};

test("a hold request needs a reason", () => {
  assert.deepEqual(errors({ action: "request_hold", reason: "Customer pays Sunday" }), {});
  assert.equal(errors({ action: "request_hold", reason: "   " }).reason, "validation.required");
  assert.equal(errors({ action: "request_hold" }).reason !== undefined, true);
  assert.equal(errors({ action: "request_hold", reason: "x".repeat(501) }).reason !== undefined, true);
});

test("a hold review is approve or reject, with an optional note", () => {
  assert.deepEqual(errors({ action: "review_hold", decision: "approve" }), {});
  assert.deepEqual(errors({ action: "review_hold", decision: "reject", note: "No proof" }), {});
  assert.notDeepEqual(errors({ action: "review_hold", decision: "maybe" }), {});
  assert.notDeepEqual(errors({ action: "review_hold" }), {});
});

test("pending and approved holds stop the deposit deadline; rejected or none don't", () => {
  assert.equal(holdsDeadline("pending"), true);
  assert.equal(holdsDeadline("approved"), true);
  assert.equal(holdsDeadline("rejected"), false);
  assert.equal(holdsDeadline(null), false);
  assert.equal(holdsDeadline(undefined), false);
});
