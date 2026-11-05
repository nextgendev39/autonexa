import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations, createDatabase, rows } from "./harness";
import { ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

const BEFORE_PHASE_2 = "00073";
const THROUGH_PHASE_2 = "00076";
const ROLLBACKS = [
  "00076_tenant_actor_keys_down.sql",
  "00075_tenant_definer_hardening_down.sql",
  "00074_tenant_rls_contract_down.sql",
];
const TENANT_TABLES = [
  "acquisition_status_history", "acquisitions", "audit_logs", "branch_locations", "branches",
  "customers", "documents", "notifications", "profiles", "push_subscriptions", "reservations",
  "sales", "staff_documents", "suppliers", "system_settings", "user_roles", "vehicle_expenses",
  "vehicle_photos", "vehicle_pricing", "vehicle_pricing_history", "vehicle_share_links",
  "vehicle_status_history", "vehicles",
];

const open: PGlite[] = [];
after(async () => {
  await Promise.all(open.map((db) => db.close()));
});

/** Everything a rollback must restore. Grants are sorted: only their set is meaningful. */
async function fingerprint(db: PGlite) {
  const q = (sql: string) => rows(db, sql);
  return {
    constraints: await q(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d
      from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    functions: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a, pg_get_functiondef(p.oid) d,
      (select array_agg(g order by g) from (
        select x.grantee::regrole::text || ':' || x.privilege_type g
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x) acl) grants
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`),
    triggers: await q(`select c.relname, t.tgname, pg_get_triggerdef(t.oid) d from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2`),
    policies: await q(`select schemaname, tablename, policyname, permissive, cmd, roles::text r, qual, with_check
      from pg_policies order by 1, 2, 3`),
    platformAdmins: await q(`select user_id from public.platform_admins order by 1`),
  };
}

const content = async (db: PGlite) => {
  const result: Record<string, unknown[]> = {};
  for (const table of TENANT_TABLES) {
    result[table] = (
      await rows<{ r: unknown }>(db, `select to_jsonb(t) r from public.${table} t order by 1`)
    ).map((row) => row.r);
  }
  return result;
};

const rollback = async (db: PGlite) => {
  for (const file of ROLLBACKS) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", file), "utf8"));
  }
};

async function zohaanBeforePhase2() {
  const db = await createDatabase(BEFORE_PHASE_2);
  open.push(db);
  await seedTenant(db, "a");
  return db;
}

describe("Phase 2 migrations on existing Zohaan Motors data", () => {
  test("change no tenant row, and roll back to the same schema", async () => {
    const db = await zohaanBeforePhase2();
    const schema = await fingerprint(db);
    const data = await content(db);

    await applyMigrations(db, "00074", THROUGH_PHASE_2);
    assert.deepEqual(await content(db), data, "Applying changed existing rows");

    await rollback(db);
    assert.deepEqual(await content(db), data, "Rolling back changed existing rows");
    assert.deepEqual(await fingerprint(db), schema, "Rollback did not restore the schema");
  });

  test("can be applied again after a rollback", async () => {
    const db = await zohaanBeforePhase2();
    await applyMigrations(db, "00074", THROUGH_PHASE_2);
    await rollback(db);
    await applyMigrations(db, "00074", THROUGH_PHASE_2);
    const [row] = await rows<{ n: number }>(
      db,
      `select count(*)::int n from pg_policies where policyname = 'tenant_isolation'`,
    );
    assert.equal(row.n, TENANT_TABLES.length);
  });

  test("keep Zohaan's Super Admins able to manage the catalog, and no one else", async () => {
    const db = await zohaanBeforePhase2();
    await applyMigrations(db, "00074", THROUGH_PHASE_2);
    const admins = await rows<{ user_id: string }>(db, `select user_id from public.platform_admins`);
    assert.deepEqual(admins, [{ user_id: id("a", "profile") }]);
  });

  // Null is allowed on audit_logs and profiles: platform events and staff have no dealership.
  test("every existing row satisfies the new keys, and stays in Zohaan Motors", async () => {
    const db = await zohaanBeforePhase2();
    await db.exec(`update public.vehicles set created_by = '${id("a", "profile")}'`);
    await applyMigrations(db, "00074", THROUGH_PHASE_2);
    const [invalid] = await rows<{ n: number }>(
      db,
      `select count(*)::int n from pg_constraint where connamespace = 'public'::regnamespace and not convalidated`,
    );
    assert.equal(invalid.n, 0, "A foreign key was left unvalidated");
    for (const table of TENANT_TABLES) {
      const [row] = await rows<{ n: number }>(
        db,
        `select count(*)::int n from public.${table} where tenant_id <> $1`,
        [ZOHAAN_TENANT_ID],
      );
      assert.equal(row.n, 0, table);
    }
  });

  test("refuses to roll back over a second dealership's settings", async () => {
    const db = await createDatabase(THROUGH_PHASE_2);
    open.push(db);
    await seedTenant(db, "a");
    await seedTenant(db, "b");
    await db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", ROLLBACKS[0]), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", ROLLBACKS[1]), "utf8"));
    await assert.rejects(
      db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", ROLLBACKS[2]), "utf8")),
    );
  });
});
