import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

/**
 * Real sessions against a running app connected to a STAGING database with two dealerships.
 * Skipped unless configured, and refuses to run without an explicit not-production flag.
 * Each user must be a Super Admin of their own dealership, so only the tenant boundary stops them.
 *
 *   TENANT_TEST_NOT_PRODUCTION=yes   TENANT_TEST_BASE_URL=http://localhost:3003
 *   TENANT_TEST_A_EMAIL, TENANT_TEST_A_PASSWORD, TENANT_TEST_B_EMAIL, TENANT_TEST_B_PASSWORD
 *   TENANT_TEST_A_CUSTOMER_ID, _A_VEHICLE_ID, _A_BRANCH_ID, _A_USER_ID, _A_BOOKING_ID, _A_ACQUISITION_ID
 */
const env = process.env;
const baseUrl = env.TENANT_TEST_BASE_URL;
const configured = env.TENANT_TEST_NOT_PRODUCTION === "yes" && Boolean(baseUrl);
const need = (name: string) => {
  const value = env[`TENANT_TEST_${name}`];
  assert.ok(value, `TENANT_TEST_${name} is required`);
  return value;
};

async function signIn(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  assert.ok(cookies.length > 0, `Sign-in failed for ${email}: ${response.status}`);
  return cookies.join("; ");
}

const call = (cookie: string, method: string, path: string, body?: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });

describe("API routes with real sessions", { skip: !configured }, () => {
  let a: string;
  let b: string;

  before(async () => {
    a = await signIn(need("A_EMAIL"), need("A_PASSWORD"));
    b = await signIn(need("B_EMAIL"), need("B_PASSWORD"));
  });

  test("each dealership's user list holds only its own people", async () => {
    const seenByB = await (await call(b, "GET", "/api/users")).text();
    assert.ok(!seenByB.includes(need("A_EMAIL")), "B saw A's email");
    assert.ok(!seenByB.includes(need("A_USER_ID")), "B saw A's user");
    const seenByA = await (await call(a, "GET", "/api/users")).text();
    assert.ok(seenByA.includes(need("A_USER_ID")), "Control: A should see its own user");
  });

  for (const path of [
    "/api/branches",
    "/api/customers",
    "/api/bookings",
    "/api/acquisitions",
    "/api/dashboard",
  ]) {
    test(`${path} shows B nothing of A's`, async () => {
      const text = await (await call(b, "GET", path)).text();
      for (const name of ["A_BRANCH_ID", "A_CUSTOMER_ID", "A_BOOKING_ID", "A_ACQUISITION_ID"]) {
        assert.ok(!text.includes(need(name)), `${path} exposed ${name}`);
      }
    });
  }

  const denied = [403, 404];
  test("B cannot open A's records by ID", async () => {
    for (const path of [
      `/api/vehicles/${need("A_VEHICLE_ID")}`,
      `/api/vehicles/${need("A_VEHICLE_ID")}/history`,
      `/api/pricing/${need("A_VEHICLE_ID")}`,
      `/api/bookings/${need("A_BOOKING_ID")}`,
      `/api/acquisitions/${need("A_ACQUISITION_ID")}`,
    ]) {
      const response = await call(b, "GET", path);
      assert.ok(denied.includes(response.status), `${path} returned ${response.status}`);
    }
  });

  test("B cannot edit A's customer through the service-role path", async () => {
    const response = await call(b, "PATCH", `/api/customers/${need("A_CUSTOMER_ID")}`, {
      firstName: "Forged",
      lastName: "Edit",
      phone: "+971500009876",
    });
    assert.ok(denied.includes(response.status), `Returned ${response.status}`);
  });

  test("B cannot edit A's branch through the service-role path", async () => {
    const response = await call(b, "PATCH", `/api/branches/${need("A_BRANCH_ID")}`, {
      name: "Forged",
      code: "FORGED",
      emirate: "dubai",
      city: "Dubai",
      addressLine1: "Road",
      isActive: true,
    });
    assert.ok(denied.includes(response.status), `Returned ${response.status}`);
  });

  test("B cannot edit A's user or re-send their invitation", async () => {
    const edit = await call(b, "PATCH", `/api/users/${need("A_USER_ID")}`, { firstName: "Forged" });
    assert.ok(denied.includes(edit.status), `Edit returned ${edit.status}`);
    const resend = await call(b, "POST", `/api/users/${need("A_USER_ID")}/resend-invitation`);
    assert.ok(denied.includes(resend.status), `Resend returned ${resend.status}`);
  });

  test("a tenant ID sent by the client is ignored", async () => {
    const response = await call(b, "GET", `/api/customers?tenant_id=${need("A_CUSTOMER_ID")}`);
    const text = await response.text();
    assert.ok(!text.includes(need("A_CUSTOMER_ID")));
  });
});
