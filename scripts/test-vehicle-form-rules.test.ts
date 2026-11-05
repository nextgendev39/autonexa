/**
 * Inventory form rules: quantity, conditional port location, minimum selling price, quantity totals.
 * Run: npx tsx --test scripts/test-vehicle-form-rules.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { firstFieldErrors } from "../src/lib/validation";
import {
  changeVehicleStatusSchema,
  markReadyForSaleSchema,
  vehicleFormRules,
} from "../src/lib/validation/vehicle";
import { quantityTotal, toPrice } from "../src/lib/vehicles/quantity";
import { isSoldStatus } from "../src/lib/vehicles/status-transitions";

const BRANCH = "00000000-0000-4000-8000-000000000001";

// The form always submits every field; blank optional fields arrive as "" or null.
const blanks = Object.fromEntries(
  [
    "vin", "chassisNumber", "variant", "bodyType", "engineSize", "exteriorColor", "interiorColor",
    "countryOfOrigin", "locationId", "purchaseDate", "registrationDate", "description", "makeId",
    "modelId", "modelYearId", "variantId", "customVariant", "portLocation",
  ].map((key) => [key, ""]),
);

function base(overrides: Record<string, unknown> = {}) {
  return {
    ...blanks,
    engineCylinders: null,
    seats: null,
    doors: null,
    make: "Toyota",
    model: "Camry",
    year: 2022,
    mileage: 1000,
    mileageUnit: "km",
    marketType: "used",
    branchId: BRANCH,
    quantity: 1,
    ...overrides,
  };
}

function errors(
  input: Record<string, unknown>,
  options: Parameters<typeof vehicleFormRules>[0] = { requirePricing: false },
) {
  const parsed = vehicleFormRules(options).safeParse(input);
  return parsed.success ? {} : firstFieldErrors(parsed.error);
}

test("quantity must be a positive whole number", () => {
  assert.equal(errors(base({ quantity: 3 })).quantity, undefined);
  // An empty number input arrives as NaN.
  for (const quantity of [0, -1, 1.5, Number.NaN]) {
    assert.ok(errors(base({ quantity })).quantity, `quantity ${quantity} should fail`);
  }
});

test("older API callers may omit the new fields", () => {
  const legacy: Record<string, unknown> = base();
  delete legacy.quantity;
  delete legacy.portLocation;
  const parsed = vehicleFormRules({ requirePricing: false }).safeParse(legacy);
  assert.ok(parsed.success);
  assert.equal(parsed.data.quantity, 1);
});

test("cross-field rules report alongside other field errors", () => {
  const result = errors(base({ make: "", initialStatus: "acquired" }), { requirePricing: true });
  assert.equal(result.make, "validation.required");
  assert.equal(result.portLocation, "validation.required");
  assert.equal(result.minimumSellingPrice, "validation.required");
});

test("port location is required only while In transit", () => {
  // Create: driven by the chosen initial status.
  assert.equal(errors(base({ initialStatus: "acquired" })).portLocation, "validation.required");
  assert.equal(errors(base({ initialStatus: "acquired", portLocation: "  " })).portLocation, "validation.required");
  assert.equal(errors(base({ initialStatus: "acquired", portLocation: "Jebel Ali" })).portLocation, undefined);
  assert.equal(errors(base({ initialStatus: "ready_for_sale" })).portLocation, undefined);

  // Edit: driven by the saved status.
  assert.equal(errors(base(), { status: "acquired", requirePricing: false }).portLocation, "validation.required");
  assert.equal(errors(base(), { status: "ready_for_sale", requirePricing: false }).portLocation, undefined);
});

test("minimum selling price is required for price editors", () => {
  const editor = { requirePricing: true };
  assert.equal(errors(base(), editor).minimumSellingPrice, "validation.required");
  assert.equal(errors(base({ minimumSellingPrice: Number.NaN }), editor).minimumSellingPrice, "validation.required");
  assert.equal(errors(base({ minimumSellingPrice: 50000 }), editor).minimumSellingPrice, undefined);
  assert.equal(errors(base({ minimumSellingPrice: 0 }), editor).minimumSellingPrice, undefined);
  // Users who cannot edit prices never see or send the field.
  assert.equal(errors(base()).minimumSellingPrice, undefined);
});

test("prices must be valid non-negative amounts", () => {
  const editor = { requirePricing: true };
  assert.equal(errors(base({ minimumSellingPrice: -1 }), editor).minimumSellingPrice, "validation.currency");
  assert.equal(
    errors(base({ minimumSellingPrice: 100, targetSellingPrice: -5 }), editor).targetSellingPrice,
    "validation.currency",
  );
});

test("selling price cannot be below the minimum", () => {
  const editor = { requirePricing: true };
  assert.equal(
    errors(base({ minimumSellingPrice: 50000, targetSellingPrice: 40000 }), editor).targetSellingPrice,
    "validation.sellingBelowMinimum",
  );
  assert.equal(errors(base({ minimumSellingPrice: 50000, targetSellingPrice: 50000 }), editor).targetSellingPrice, undefined);
  assert.equal(errors(base({ minimumSellingPrice: 50000 }), editor).targetSellingPrice, undefined);
});

test("quantity totals multiply per-unit prices", () => {
  assert.equal(quantityTotal(50000, 3), 150000);
  assert.equal(quantityTotal(1234.56, 3), 3703.68);
  assert.equal(quantityTotal(0.1, 3), 0.3);
  // A single or invalid quantity counts as one unit; a missing price has no total.
  assert.equal(quantityTotal(50000, 1), 50000);
  assert.equal(quantityTotal(50000, Number.NaN), 50000);
  assert.equal(quantityTotal(null, 3), null);
  assert.equal(quantityTotal(Number.NaN, 3), null);
});

test("form price values are read as numbers", () => {
  assert.equal(toPrice("45000.50"), 45000.5);
  assert.equal(toPrice(45000), 45000);
  assert.equal(toPrice(""), null);
  assert.equal(toPrice(Number.NaN), null);
  assert.equal(toPrice(undefined), null);
});

test("status changes accept an optional unit quantity", () => {
  assert.ok(changeVehicleStatusSchema.safeParse({ status: "sold" }).success);
  assert.ok(changeVehicleStatusSchema.safeParse({ status: "sold", quantity: 2 }).success);
  assert.ok(!changeVehicleStatusSchema.safeParse({ status: "sold", quantity: 0 }).success);
  assert.ok(markReadyForSaleSchema.safeParse({ quantity: 3 }).success);
  assert.ok(!markReadyForSaleSchema.safeParse({ quantity: -1 }).success);
});

test("sold and delivered vehicles are locked from editing; returned ones are not", () => {
  assert.ok(isSoldStatus("sold"));
  assert.ok(isSoldStatus("delivered"));
  assert.ok(!isSoldStatus("returned"));
  assert.ok(!isSoldStatus("reserved"));
  assert.ok(!isSoldStatus("ready_for_sale"));
});
