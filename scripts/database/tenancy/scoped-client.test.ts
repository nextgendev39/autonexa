import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createScopedClient,
  TenantScopeError,
} from "../../../src/lib/server/privileged/scoped-client";

const TENANT = "00000000-0000-4000-8000-000000000002";

/** The real supabase-js builders, with the network replaced so each request can be inspected. */
function harness() {
  const requests: { method: string; url: URL; body: unknown }[] = [];
  const raw = createClient("https://example.test", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requests.push({
          method: init?.method ?? "GET",
          url: new URL(String(input)),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { requests, client: createScopedClient(raw as any, TENANT) as any };
}
const tenantFilter = (url: URL) => url.searchParams.get("tenant_id");

describe("scoped service-role client", () => {
  test("a read is limited to the tenant, even by a known ID", async () => {
    const { client, requests } = harness();
    await client.from("customers").select("id").eq("id", "someone-elses-id").maybeSingle();
    assert.equal(tenantFilter(requests[0].url), `eq.${TENANT}`);
    assert.equal(requests[0].url.searchParams.get("id"), "eq.someone-elses-id");
  });

  test("count-only reads are limited too", async () => {
    const { client, requests } = harness();
    await client
      .from("vehicle_photos")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", "p");
    assert.equal(tenantFilter(requests[0].url), `eq.${TENANT}`);
  });

  test("updates are limited to the tenant", async () => {
    const { client, requests } = harness();
    await client.from("customers").update({ phone: "1" }).eq("id", "x");
    assert.equal(requests[0].method, "PATCH");
    assert.equal(tenantFilter(requests[0].url), `eq.${TENANT}`);
  });

  test("deletes are limited to the tenant", async () => {
    const { client, requests } = harness();
    await client.from("notifications").delete().eq("user_id", "x");
    assert.equal(requests[0].method, "DELETE");
    assert.equal(tenantFilter(requests[0].url), `eq.${TENANT}`);
  });

  test("new rows are stamped with the tenant", async () => {
    const { client, requests } = harness();
    await client.from("branches").insert({ name: "B" });
    await client.from("push_subscriptions").upsert([{ endpoint: "e" }], { onConflict: "endpoint" });
    assert.deepEqual(requests[0].body, { name: "B", tenant_id: TENANT });
    assert.deepEqual(requests[1].body, [{ endpoint: "e", tenant_id: TENANT }]);
  });

  test("a row naming another tenant is refused before any request", async () => {
    const { client, requests } = harness();
    assert.throws(
      () => client.from("branches").insert({ name: "B", tenant_id: "other" }),
      TenantScopeError,
    );
    assert.equal(requests.length, 0);
  });

  test("tenant_id cannot be changed by an update", () => {
    const { client } = harness();
    assert.throws(() => client.from("customers").update({ tenant_id: TENANT }), TenantScopeError);
  });

  test("shared tables can be read but never written", async () => {
    const { client, requests } = harness();
    await client.from("roles").select("id, key");
    assert.equal(tenantFilter(requests[0].url), null);
    assert.equal(client.from("roles").insert, undefined);
    assert.equal(client.from("vehicle_makes").update, undefined);
    assert.equal(client.from("role_permissions").delete, undefined);
  });

  test("tables outside the dealership's reach are refused", () => {
    const { client } = harness();
    for (const table of [
      "platform_admins",
      "tenants",
      "tenant_counters",
      "password_reset_otps",
      "email_verification_otps",
    ]) {
      assert.throws(() => client.from(table), TenantScopeError, table);
    }
  });

  test("a client cannot be created without a tenant", () => {
    const raw = createClient("https://example.test", "k");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.throws(() => createScopedClient(raw as any, ""), TenantScopeError);
  });
});
