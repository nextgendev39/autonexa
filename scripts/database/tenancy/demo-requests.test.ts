import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations, asUser, attempt, createDatabase, rows } from "./harness";
import { ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/** Landing-page demo requests: service-role writes, platform staff read and follow up. */
const OWNER = "abababab-0000-4000-8000-000000000011";
const SUPPORT = "abababab-0000-4000-8000-000000000012";
const DEALER = id("a", "profile");

let db: PGlite;

const addRequest = async (email: string | null, phone: string | null = null) =>
  (
    await rows<{ id: string }>(
      db,
      `insert into public.demo_requests (name, dealership, email, phone) values ('Sara', 'Gulf Motors', $1, $2) returning id`,
      [email, phone],
    )
  )[0].id;

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  for (const [user, role] of [
    [OWNER, "owner"],
    [SUPPORT, "support"],
  ]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [user, `${role}@autonexa.test`]);
    await db.query(`update public.profiles set status = 'active', tenant_id = null where id = $1`, [user]);
    await db.query(`delete from public.tenant_members where user_id = $1`, [user]);
    await db.query(`insert into public.platform_admins (user_id, role) values ($1, $2)`, [user, role]);
  }
});

after(async () => {
  await db?.close();
});

describe("demo requests", () => {
  test("need a phone or an email", async () => {
    await db.exec("begin");
    try {
      const missing = await attempt(db, () => addRequest(null, null));
      assert.equal(missing.ok, false);
      assert.equal((await attempt(db, () => addRequest(null, "+971 50 000 0000"))).ok, true);
    } finally {
      await db.exec("rollback");
    }
  });

  test("dealership staff and visitors can't read or write them", async () => {
    const request = await addRequest("lead@example.com");
    try {
      await asUser(db, DEALER, async () => {
        assert.equal((await rows(db, `select * from public.demo_requests`)).length, 0);
        assert.equal((await attempt(db, () => rows(db, `select * from public.platform_demo_requests()`))).ok, false);
        assert.equal(
          (await attempt(db, () => db.query(`insert into public.demo_requests (name, email) values ('x', 'x@x.test')`))).ok,
          false,
        );
        assert.equal(
          (await attempt(db, () => db.query(`select public.platform_update_demo_request($1, 'lost')`, [request]))).ok,
          false,
        );
      });
      await db.exec("begin");
      try {
        await db.exec("set local role anon");
        assert.equal((await attempt(db, () => rows(db, `select * from public.demo_requests`))).ok, false);
      } finally {
        await db.exec("rollback");
      }
    } finally {
      await db.query(`delete from public.demo_requests`);
    }
  });

  test("platform staff see each request and whether its email already has a login", async () => {
    const dealerEmail = (await rows<{ email: string }>(db, `select email from auth.users where id = $1`, [DEALER]))[0].email;
    await addRequest(dealerEmail.toUpperCase());
    await addRequest("new@example.com");
    try {
      await asUser(db, SUPPORT, async () => {
        const list = await rows<{ email: string; account_user_id: string | null; account_tenant_id: string | null }>(
          db,
          `select email, account_user_id, account_tenant_id from public.platform_demo_requests() order by email`,
        );
        assert.equal(list.length, 2);
        const known = list.find((row) => row.email === dealerEmail.toUpperCase())!;
        assert.equal(known.account_user_id, DEALER);
        assert.equal(known.account_tenant_id, ZOHAAN_TENANT_ID);
        const fresh = list.find((row) => row.email === "new@example.com")!;
        assert.equal(fresh.account_user_id, null);
      });
    } finally {
      await db.query(`delete from public.demo_requests`);
    }
  });

  test("only managers move a request along, and each change is audited", async () => {
    const request = await addRequest("lead@example.com");
    try {
      await asUser(db, SUPPORT, async () => {
        const denied = await attempt(db, () => db.query(`select public.platform_update_demo_request($1, 'contacted')`, [request]));
        assert.equal(denied.ok, false);
      });
      await asUser(db, OWNER, async () => {
        await db.query(`select public.platform_update_demo_request($1, 'converted', ' Signed up ', $2)`, [request, ZOHAAN_TENANT_ID]);
        const [row] = await rows<{ status: string; staff_notes: string; tenant_id: string; status_changed_at: string | null }>(
          db,
          `select status, staff_notes, tenant_id, status_changed_at from public.demo_requests where id = $1`,
          [request],
        );
        assert.deepEqual([row.status, row.staff_notes, row.tenant_id], ["converted", "Signed up", ZOHAAN_TENANT_ID]);
        assert.ok(row.status_changed_at);
        const bad = await attempt(db, () => db.query(`select public.platform_update_demo_request($1, 'won')`, [request]));
        assert.equal(bad.ok, false);
        await db.query(`select public.platform_update_demo_request($1, null, '', null, true)`, [request]);
        const [cleared] = await rows<{ staff_notes: string | null; tenant_id: string | null; status: string }>(
          db,
          `select staff_notes, tenant_id, status from public.demo_requests where id = $1`,
          [request],
        );
        assert.deepEqual([cleared.staff_notes, cleared.tenant_id, cleared.status], [null, null, "converted"]);
        const [log] = await rows<{ n: number }>(
          db,
          `select count(*)::int n from public.platform_audit_logs where action = 'demo_request.updated' and target_id = $1`,
          [request],
        );
        assert.equal(log.n, 2);
      });
    } finally {
      await db.query(`delete from public.demo_requests`);
    }
  });

  test("rolls back cleanly", async () => {
    const old = await createDatabase("00085");
    try {
      const before_ = await rows(old, `select role, permission from public.platform_role_permissions order by 1, 2`);
      await applyMigrations(old, "00086", "00086");
      await old.exec(readFileSync(join(process.cwd(), "supabase/rollbacks/00086_platform_demo_requests_down.sql"), "utf8"));
      assert.deepEqual(await rows(old, `select role, permission from public.platform_role_permissions order by 1, 2`), before_);
      assert.equal((await rows(old, `select to_regclass('public.demo_requests') r`))[0].r, null);
    } finally {
      await old.close();
    }
  });
});
