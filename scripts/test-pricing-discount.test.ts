/**
 * Pricing tab: maximum discount % is derived from the amount and the target price.
 * Run: npx tsx --test scripts/test-pricing-discount.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { firstFieldErrors } from "../src/lib/validation";
import { maxDiscountPercentFrom, upsertPricingSchema } from "../src/lib/validation/pricing";

test("discount percent is the amount as a share of the target price", () => {
  assert.equal(maxDiscountPercentFrom(5000, 100000), 5);
  assert.equal(maxDiscountPercentFrom("2500", "150000"), 1.67);
  assert.equal(maxDiscountPercentFrom(0, 100000), 0);
});

test("no percent without both amount and a positive target", () => {
  assert.equal(maxDiscountPercentFrom(null, 100000), null);
  assert.equal(maxDiscountPercentFrom(5000, null), null);
  assert.equal(maxDiscountPercentFrom(5000, 0), null);
  assert.equal(maxDiscountPercentFrom("", ""), null);
});

test("discount cannot exceed the target price", () => {
  const parsed = upsertPricingSchema.safeParse({ targetSellingPrice: 100000, maximumDiscountAmount: 120000 });
  assert.ok(!parsed.success);
  assert.equal(firstFieldErrors(parsed.error).maximumDiscountAmount, "pricing.validation.discountExceedsTarget");
  assert.ok(upsertPricingSchema.safeParse({ targetSellingPrice: 100000, maximumDiscountAmount: 5000 }).success);
});
