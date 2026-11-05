import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import {
  LAST_SINGLE_TENANT_MIGRATION,
  applyMigrations,
  attempt,
  createDatabase,
  rows,
} from "./harness";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/** Migrations of the expand stage: safe to run while the pre-tenancy app is still deployed. */
const THROUGH = "00073";
const ROLLBACKS = [
  "00073_tenant_functions_down.sql",
  "00072_tenant_constraints_down.sql",
  "00071_tenant_id_columns_down.sql",
  "00070_tenancy_core_down.sql",
];

const open: PGlite[] = [];
async function legacyDatabase() {
  const db = await createDatabase(LAST_SINGLE_TENANT_MIGRATION);
  open.push(db);
  await seedTenant(db, "a");
  return db;
}
/** Attempts need a transaction for their savepoint; this one always rolls back. */
async function attemptAlone<T>(db: PGlite, work: () => Promise<T>) {
  await db.exec("begin");
  try {
    return await attempt(db, work);
  } finally {
    await db.exec("rollback");
  }
}
const rollback = async (db: PGlite) => {
  for (const file of ROLLBACKS) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", file), "utf8"));
  }
};

after(async () => {
  await Promise.all(open.map((db) => db.close()));
});

/** Everything about the schema that a rollback must restore. */
async function fingerprint(db: PGlite) {
  const q = (sql: string) => rows(db, sql);
  return {
    columns: await q(`select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'public' order by 1, 2`),
    constraints: await q(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d
      from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    indexes: await q(`select tablename, indexname, indexdef from pg_indexes
      where schemaname = 'public' order by 1, 2`),
    functions: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a,
      pg_get_functiondef(p.oid) d, p.proacl::text acl
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`),
    triggers: await q(`select c.relname, t.tgname, pg_get_triggerdef(t.oid) d
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2`),
    policies:
      await q(`select schemaname, tablename, policyname, permissive, cmd, roles::text r, qual, with_check
      from pg_policies order by 1, 2, 3`),
    tables: await q(`select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
  };
}

const DATA_TABLES = [
  "profiles",
  "branches",
  "customers",
  "vehicles",
  "vehicle_expenses",
  "acquisitions",
  "reservations",
  "sales",
  "documents",
  "notifications",
  "user_roles",
  "audit_logs",
  "system_settings",
  "vehicle_status_history",
];
async function dataSnapshot(db: PGlite) {
  const result: Record<string, unknown[]> = {};
  for (const table of DATA_TABLES) {
    result[table] = (
      await rows<{ r: Record<string, unknown> }>(
        db,
        `select to_jsonb(t) - 'tenant_id' r from public.${table} t order by to_jsonb(t)::text`,
      )
    ).map((row) => row.r);
  }
  return result;
}

describe("rollback", () => {
  test("restores the schema exactly and keeps every row", async () => {
    const db = await legacyDatabase();
    const schema = await fingerprint(db);
    const data = await dataSnapshot(db);
    await applyMigrations(db, "00070", THROUGH);
    assert.notDeepEqual(await fingerprint(db), schema, "The migrations should change the schema");
    await rollback(db);
    const restored = await fingerprint(db);
    for (const key of Object.keys(schema) as (keyof typeof schema)[]) {
      assert.deepEqual(restored[key], schema[key], `${key} differ after rollback`);
    }
    assert.deepEqual(await dataSnapshot(db), data);
  });

  test("does not reuse record numbers issued while tenancy was live", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    const [issued] = await rows<{ n: string }>(db, `select public.next_vehicle_stock_number() n`);
    await rollback(db);
    const [next] = await rows<{ n: string }>(db, `select public.next_vehicle_stock_number() n`);
    assert.ok(
      Number(next.n.replace(/\D/g, "")) > Number(issued.n.replace(/\D/g, "")),
      `${next.n} should follow ${issued.n}`,
    );
  });

  test("refuses to run once a second dealership exists", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    await db.query(
      `insert into public.tenants (id, name, slug, number_prefix) values ($1, 'Second', 'second', 'SD')`,
      [SECOND_TENANT_ID],
    );
    for (const file of ROLLBACKS.slice(1)) {
      const outcome = await attemptAlone(db, () =>
        db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", file), "utf8")),
      );
      assert.equal(outcome.ok, false, `${file} ran`);
      if (!outcome.ok) assert.match(outcome.error, /second dealership/);
    }
  });
});

describe("the pre-tenancy app keeps working during the expand stage", () => {
  test("service-role writes that send no tenant still land in Zohaan Motors", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    const [customer] = await rows<{ tenant_id: string }>(
      db,
      `insert into public.customers (customer_code, first_name, last_name, display_name, phone)
       values ('NEW', 'x', 'x', 'x', '+971500000055') returning tenant_id`,
    );
    assert.equal(customer.tenant_id, ZOHAAN_TENANT_ID);
  });

  test("an invited user gets a Zohaan Motors profile and membership", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    const user = "dddddddd-0000-4000-8000-000000000001";
    await db.query(`insert into auth.users (id, email) values ($1, 'new@example.test')`, [user]);
    const [profile] = await rows<{ tenant_id: string }>(
      db,
      `select tenant_id from public.profiles where id = $1`,
      [user],
    );
    assert.equal(profile.tenant_id, ZOHAAN_TENANT_ID);
    const members = await rows(db, `select 1 from public.tenant_members where user_id = $1`, [
      user,
    ]);
    assert.equal(members.length, 1);
  });

  test("the Settings upsert on key alone still works", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    const write = () =>
      db.exec(`insert into public.system_settings (key, value) values ('booking.deposit_minutes', '77')
        on conflict (key) do update set value = excluded.value`);
    await write();
    await write();
    const found = await rows(
      db,
      `select 1 from public.system_settings where key = 'booking.deposit_minutes'`,
    );
    assert.equal(found.length, 1);
  });

  test("the bookings alert list still finds Zohaan's admins with no argument", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    const admins = await rows<{ admin: string }>(
      db,
      `select public.active_super_admin_ids() admin`,
    );
    assert.deepEqual(
      admins.map((a) => a.admin),
      [id("a", "profile")],
    );
  });

  test("foreign keys keep their names, one per relationship, so API joins stay unambiguous", async () => {
    const db = await legacyDatabase();
    const listing = () =>
      rows<{ t: string; ref: string; conname: string }>(
        db,
        `select conrelid::regclass::text t, confrelid::regclass::text ref, conname
         from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
           and conname not like '%\\_tenant\\_id\\_fkey'
           and conrelid::regclass::text not in ('tenant_members', 'tenant_counters', 'platform_admins')
         order by 1, 3`,
      );
    const before = await listing();
    await applyMigrations(db, "00070", THROUGH);
    assert.deepEqual(await listing(), before);
  });

  test("delete behaviour is unchanged and never clears tenant_id", async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, "00070", THROUGH);
    await db.exec("begin");
    try {
      await db.query(`update public.customers set branch_id = $1 where id = $2`, [
        id("a", "branch"),
        id("a", "customer"),
      ]);
      await db.exec(`set local session_replication_role = origin`);
      await db.exec(`delete from public.reservations; delete from public.sales; delete from public.acquisitions;
        delete from public.vehicles; update public.profiles set branch_id = null;
        delete from public.documents where false;`);
      await db.query(`delete from public.branches where id = $1`, [id("a", "branch")]);
      const [customer] = await rows<{ branch_id: string | null; tenant_id: string }>(
        db,
        `select branch_id, tenant_id from public.customers where id = $1`,
        [id("a", "customer")],
      );
      assert.deepEqual(customer, { branch_id: null, tenant_id: ZOHAAN_TENANT_ID });
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("the live database's AN- records", () => {
  /** Reproduces live: schema at 00068, records renamed, sequences past their numbers. */
  async function liveLike() {
    const db = await createDatabase("00068");
    open.push(db);
    await seedTenant(db, "a");
    await db.query(`update public.vehicles set stock_number = 'AN-000006' where id = $1`, [
      id("a", "vehicle"),
    ]);
    await db.query(
      `update public.acquisitions set acquisition_number = 'AN-ACQ-000011' where id = $1`,
      [id("a", "acquisition")],
    );
    await db.query(
      `update public.branches set name = 'AutoNexa Dubai', code = 'DXB-01' where id = $1`,
      [id("a", "branch")],
    );
    await db.query(
      `insert into public.notifications (user_id, type, title, message, data)
       values ($1, 'test', 'T', 'Car AN-000006 sold', '{"stockNumber":"AN-000006","customerName":"PLAN-B"}')`,
      [id("a", "profile")],
    );
    await db.exec(`select setval('public.vehicle_stock_number_seq', 6);
      select setval('public.acquisition_number_seq', 11);`);
    return db;
  }

  test("return to ZM-, and numbering continues from the same digits", async () => {
    const db = await liveLike();
    await applyMigrations(db, "00069", THROUGH);
    const [vehicle] = await rows<{ stock_number: string; tenant_id: string }>(
      db,
      `select stock_number, tenant_id from public.vehicles where id = $1`,
      [id("a", "vehicle")],
    );
    assert.deepEqual(vehicle, { stock_number: "ZM-000006", tenant_id: ZOHAAN_TENANT_ID });
    const [acquisition] = await rows<{ acquisition_number: string }>(
      db,
      `select acquisition_number from public.acquisitions where id = $1`,
      [id("a", "acquisition")],
    );
    assert.equal(acquisition.acquisition_number, "ZM-ACQ-000011");
    const [branch] = await rows<{ name: string }>(
      db,
      `select name from public.branches where id = $1`,
      [id("a", "branch")],
    );
    assert.equal(branch.name, "Zohaan Motors Dubai");
    const [note] = await rows<{ message: string; data: Record<string, string> }>(
      db,
      `select message, data from public.notifications where type = 'test' and data ? 'stockNumber'`,
    );
    assert.equal(note.message, "Car ZM-000006 sold");
    assert.deepEqual(note.data, { stockNumber: "ZM-000006", customerName: "PLAN-B" });
    const [next] = await rows<{ s: string; a: string }>(
      db,
      `select public.next_tenant_number($1, 'vehicle_stock', '') s, public.next_tenant_number($1, 'acquisition', 'ACQ-') a`,
      [ZOHAAN_TENANT_ID],
    );
    assert.deepEqual(next, { s: "ZM-000007", a: "ZM-ACQ-000012" });
  });

  test("a stock number that only contains AN- elsewhere is untouched", async () => {
    const db = await liveLike();
    await db.query(`update public.vehicles set stock_number = 'PLAN-000006' where id = $1`, [
      id("a", "vehicle"),
    ]);
    await applyMigrations(db, "00069", THROUGH);
    const [vehicle] = await rows<{ stock_number: string }>(
      db,
      `select stock_number from public.vehicles where id = $1`,
      [id("a", "vehicle")],
    );
    assert.equal(vehicle.stock_number, "PLAN-000006");
  });

  test("a branch renamed by staff keeps its name", async () => {
    const db = await liveLike();
    await db.query(`update public.branches set name = 'Marina Showroom' where id = $1`, [
      id("a", "branch"),
    ]);
    await applyMigrations(db, "00069", THROUGH);
    const [branch] = await rows<{ name: string }>(
      db,
      `select name from public.branches where id = $1`,
      [id("a", "branch")],
    );
    assert.equal(branch.name, "Marina Showroom");
  });

  test("the rollback restores the live names", async () => {
    const db = await liveLike();
    await applyMigrations(db, "00069", "00069");
    await db.exec(
      readFileSync(
        join(process.cwd(), "supabase/rollbacks/00069_autonexa_record_prefix_down.sql"),
        "utf8",
      ),
    );
    const [vehicle] = await rows<{ stock_number: string }>(
      db,
      `select stock_number from public.vehicles where id = $1`,
      [id("a", "vehicle")],
    );
    assert.equal(vehicle.stock_number, "AN-000006");
  });
});

describe("with a second dealership", () => {
  async function twoTenants() {
    const db = await createDatabase(THROUGH);
    open.push(db);
    await seedTenant(db, "a");
    await seedTenant(db, "b");
    return db;
  }

  test("a write with no tenant and no parent fails instead of guessing", async () => {
    const db = await twoTenants();
    const outcome = await attemptAlone(db, () =>
      rows(db, `insert into public.suppliers (name) values ('unattributed') returning id`),
    );
    assert.equal(outcome.ok, false);
  });

  test("a child written without a session inherits its parent's dealership", async () => {
    const db = await twoTenants();
    const [row] = await rows<{ tenant_id: string }>(
      db,
      `insert into public.vehicle_status_history (vehicle_id, new_status)
       values ($1, 'ready_for_sale') returning tenant_id`,
      [id("b", "vehicle")],
    );
    assert.equal(row.tenant_id, SECOND_TENANT_ID);
  });

  test("a child stating a different dealership from its parent is rejected", async () => {
    const db = await twoTenants();
    const outcome = await attemptAlone(db, () =>
      rows(
        db,
        `insert into public.vehicle_status_history (tenant_id, vehicle_id, new_status)
         values ($1, $2, 'ready_for_sale')`,
        [ZOHAAN_TENANT_ID, id("b", "vehicle")],
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("the no-argument alert list finds nobody rather than the wrong admins", async () => {
    const db = await twoTenants();
    assert.equal((await rows(db, `select public.active_super_admin_ids()`)).length, 0);
  });

  test("a split vehicle stays in its dealership and gets that dealership's number", async () => {
    const db = await twoTenants();
    await db.exec(`set app.bypass_vehicle_cost_guard = 'true'`);
    await db.query(`update public.vehicles set quantity = 3 where id = $1`, [id("b", "vehicle")]);
    const [split] = await rows<{ n: string }>(
      db,
      `select public.split_vehicle_units($1, 1, $2) n`,
      [id("b", "vehicle"), id("b", "profile")],
    );
    const [unit] = await rows<{ tenant_id: string; stock_number: string }>(
      db,
      `select tenant_id, stock_number from public.vehicles where id = $1`,
      [split.n],
    );
    assert.equal(unit.tenant_id, SECOND_TENANT_ID);
    assert.match(unit.stock_number, /^SD-\d{6}$/);
  });
});
