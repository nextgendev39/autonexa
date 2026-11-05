import assert from "node:assert/strict";
import { test } from "node:test";

import { seesSalesPricingOnly } from "../src/lib/permissions/roles";

// Live grants: sales_executive has pricing.view + vehicle.price.view (seed + migration 00034).
const grants =
  (...permissions: string[]) =>
  (permission: string) =>
    permissions.includes(permission);

test("sales executive with pricing.view still gets only target price and max discount", () => {
  assert.equal(
    seesSalesPricingOnly(["sales_executive"], grants("pricing.view", "vehicle.price.view")),
    true,
  );
});

test("sales executive who is also an accountant gets the full view", () => {
  assert.equal(
    seesSalesPricingOnly(
      ["sales_executive", "accountant"],
      grants("pricing.view", "vehicle.cost.view", "vehicle.profit.view"),
    ),
    false,
  );
});

test("sales executive allowed to edit pricing gets the full view", () => {
  assert.equal(
    seesSalesPricingOnly(["sales_executive"], grants("pricing.view", "pricing.update")),
    false,
  );
});

test("Super Admins and other roles are never limited", () => {
  assert.equal(seesSalesPricingOnly(["super_admin", "sales_executive"], grants()), false);
  assert.equal(seesSalesPricingOnly(["accountant"], grants("vehicle.cost.view")), false);
  assert.equal(seesSalesPricingOnly(["logistics"], grants()), false);
});
