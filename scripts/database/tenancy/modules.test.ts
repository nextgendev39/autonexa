import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { canReachBranch } from "../../../src/lib/notifications/branch-recipients";
import { asSuperuser, asUser, attempt, createDatabase, rows } from "./harness";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";
import { parseSelect, selectsInSource, type SelectItem } from "./selects";

/**
 * Each module's own work (create, read, update, delete) for the owning dealership, and the same
 * work attempted from another dealership. isolation.test.ts covers reaching a row by ID; this
 * covers creating rows that link across dealerships, and the holes found auditing Phase 2.
 */
const A = { user: id("a", "profile"), tenant: ZOHAAN_TENANT_ID };
const B = { user: id("b", "profile"), tenant: SECOND_TENANT_ID };

let db: PGlite;
let docTypeId: string;

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");
  const [type] = await rows<{ id: string }>(db, `select id from public.document_types where key = 'test'`);
  docTypeId = type.id;
});

after(async () => {
  await db?.close();
});

/** A new row as the given user: the statement, its values, and the row it must land as. */
const insertAs = (user: string, table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row);
  return asUser(db, user, () =>
    attempt(db, () =>
      rows<{ id: string; tenant_id: string }>(
        db,
        `insert into public.${table} (${columns.join(", ")})
         values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning id, tenant_id`,
        Object.values(row),
      ),
    ),
  );
};

const vehicleRow = (t: "a" | "b", suffix: string) => ({
  stock_number: `NEW-${suffix}`,
  make: "Toyota",
  model: "Camry",
  year: 2024,
  mileage: 1,
  branch_id: id(t, "branch"),
  source: "other",
  status: "acquired",
});
const customerRow = (suffix: string) => ({
  customer_code: `NEW-${suffix}`,
  first_name: "New",
  last_name: "Customer",
  display_name: "New Customer",
  phone: `+97155${suffix.padStart(7, "0")}`,
});

/** Module, table, the row its owner creates, and a column their update can change. */
type Case = {
  module: string;
  table: string;
  row: (t: "a" | "b") => Record<string, unknown>;
  update: string;
  /** A row in tenant A this module refers to, with a B user trying to link to it. */
  crossLink?: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    module: "Inventory",
    table: "vehicles",
    row: (t) => vehicleRow(t, `V${t}`),
    update: "mileage = 2",
    crossLink: vehicleRow("a", "VX"),
  },
  {
    module: "Inventory photos",
    table: "vehicle_photos",
    row: (t) => ({
      vehicle_id: id(t, "vehicle"),
      storage_path: `${id(t, "vehicle")}/gallery/new.jpg`,
      category: "front",
      file_name: "new.jpg",
    }),
    update: "sort_order = 2",
    crossLink: {
      vehicle_id: id("a", "vehicle"),
      storage_path: `${id("a", "vehicle")}/gallery/x.jpg`,
      category: "front",
      file_name: "x.jpg",
    },
  },
  {
    module: "Inventory expenses",
    table: "vehicle_expenses",
    row: (t) => ({
      vehicle_id: id(t, "vehicle"),
      category: "other",
      amount: 10,
      expense_date: "2026-01-01",
    }),
    update: "amount = 11",
    crossLink: { vehicle_id: id("a", "vehicle"), category: "other", amount: 10, expense_date: "2026-01-01" },
  },
  {
    module: "Customers",
    table: "customers",
    row: (t) => customerRow(t === "a" ? "1" : "2"),
    update: "city = 'Dubai'",
  },
  {
    module: "Acquisition suppliers",
    table: "suppliers",
    row: (t) => ({ name: `New supplier ${t}` }),
    update: "name = 'Renamed'",
  },
  {
    module: "Documents",
    table: "documents",
    row: (t) => ({
      document_type_id: "DOC_TYPE",
      entity_type: "vehicles",
      entity_id: id(t, "vehicle"),
      storage_path: `${id(t, "vehicle")}/new.pdf`,
      file_name: "new.pdf",
      branch_id: id(t, "branch"),
    }),
    update: "notes = 'x'",
    crossLink: {
      document_type_id: "DOC_TYPE",
      entity_type: "vehicles",
      entity_id: id("a", "vehicle"),
      storage_path: `${id("a", "vehicle")}/x.pdf`,
      file_name: "x.pdf",
      branch_id: id("a", "branch"),
    },
  },
  {
    module: "Notifications",
    table: "notifications",
    // Notifications are only readable by their recipient, so the owner sends one to themselves.
    row: (t) => ({ user_id: id(t, "profile"), type: "t", title: "t", message: "m" }),
    update: "is_read = false",
    crossLink: { user_id: A.user, type: "t", title: "t", message: "m" },
  },
];

const resolve = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === "DOC_TYPE" ? docTypeId : value]),
  );

describe("each module's own work", () => {
  for (const { module, table, row, update, crossLink } of CASES) {
    test(`${module}: the owner can create, read, update and delete`, async () => {
      await asUser(db, B.user, async () => {
        const values = resolve(row("b"));
        const columns = Object.keys(values);
        const [created] = await rows<{ id: string; tenant_id: string }>(
          db,
          `insert into public.${table} (${columns.join(", ")})
           values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning id, tenant_id`,
          Object.values(values),
        );
        assert.equal(created.tenant_id, B.tenant, "The new row must land in the caller's dealership");
        const seen = await rows(db, `select 1 from public.${table} where id = $1`, [created.id]);
        assert.equal(seen.length, 1, "read");
        const updated = await rows(db, `update public.${table} set ${update} where id = $1 returning 1`, [
          created.id,
        ]);
        assert.equal(updated.length, 1, "update");
        // Not every table allows deletes from the client, but none may error differently per tenant.
        await attempt(db, () => rows(db, `delete from public.${table} where id = $1`, [created.id]));
      });
    });

    test(`${module}: a row claiming another dealership is refused`, async () => {
      const outcome = await insertAs(B.user, table, { ...resolve(row("b")), tenant_id: A.tenant });
      assert.equal(outcome.ok, false);
    });

    if (crossLink) {
      test(`${module}: a row pointing into another dealership is refused`, async () => {
        const outcome = await insertAs(B.user, table, resolve(crossLink));
        assert.equal(outcome.ok, false);
      });
    }
  }

  test("Reservations: a booking cannot use another dealership's customer", async () => {
    const outcome = await insertAs(B.user, "reservations", {
      reservation_number: "BK-X",
      vehicle_id: id("b", "vehicle"),
      customer_id: id("a", "customer"),
      branch_id: id("b", "branch"),
      amount: 0,
      status: "active",
    });
    assert.equal(outcome.ok, false);
  });

  test("Sales: a sale cannot use another dealership's car", async () => {
    const outcome = await insertAs(B.user, "sales", {
      sale_number: "SL-X",
      vehicle_id: id("a", "vehicle"),
      customer_id: id("b", "customer"),
      branch_id: id("b", "branch"),
      status: "quotation",
      vehicle_price: 1,
      final_amount: 1,
    });
    assert.equal(outcome.ok, false);
  });

  test("Payments: another dealership cannot record money on a booking", async () => {
    const changed = await asUser(db, B.user, () =>
      rows(db, `update public.reservations set amount = 999, balance_received = 999 where id = $1 returning 1`, [
        id("a", "reservation"),
      ]),
    );
    assert.equal(changed.length, 0);
  });

  test("Payments: another dealership cannot record money on a sale", async () => {
    const changed = await asUser(db, B.user, () =>
      rows(db, `update public.sales set final_amount = 1 where id = $1 returning 1`, [id("a", "sale")]),
    );
    assert.equal(changed.length, 0);
  });

  test("Pricing: another dealership cannot change a price directly", async () => {
    const changed = await asUser(db, B.user, () =>
      rows(db, `update public.vehicle_pricing set pricing_notes = 'x' where vehicle_id = $1 returning 1`, [
        id("a", "vehicle"),
      ]),
    );
    assert.equal(changed.length, 0);
  });

  test("Reports: dashboard reads return only the caller's dealership", async () => {
    const seen = await asUser(db, B.user, async () => ({
      vehicles: await rows<{ tenant_id: string }>(db, `select tenant_id from public.vehicles`),
      bookings: await rows<{ tenant_id: string }>(db, `select tenant_id from public.reservations`),
      branches: await rows<{ tenant_id: string }>(db, `select tenant_id from public.branches`),
      audit: await rows<{ tenant_id: string }>(db, `select tenant_id from public.audit_logs`),
    }));
    for (const [source, list] of Object.entries(seen)) {
      assert.ok(list.length > 0, `${source}: control, the dealership has rows of its own`);
      assert.ok(list.every((row) => row.tenant_id === B.tenant), `${source} crossed dealerships`);
    }
  });
});

describe("someone who is not logged in", () => {
  const asAnon = async <T>(work: () => Promise<T>) => {
    await db.exec("begin");
    try {
      await db.exec("set local role anon");
      return await work();
    } finally {
      await db.exec("rollback");
    }
  };

  test("can call no database function in the public schema", async () => {
    const callable = await rows<{ n: string }>(
      db,
      `select p.oid::regprocedure::text n from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
         and has_function_privilege('anon', p.oid, 'execute')`,
    );
    assert.deepEqual(callable.map((r) => r.n), []);
  });

  for (const [name, sql] of Object.entries({
    write_audit_log: `select public.write_audit_log('forged', 'vehicles', '${id("a", "vehicle")}', null, '{"tenant_id": "${A.tenant}"}'::jsonb)`,
    split_vehicle_units: `select public.split_vehicle_units('${id("a", "vehicle")}', 1, '${B.user}')`,
    undo_vehicle_split: `select public.undo_vehicle_split('${id("a", "vehicle")}')`,
    next_vehicle_stock_number: `select public.next_vehicle_stock_number()`,
  })) {
    test(`is refused ${name}`, async () => {
      const outcome = await asAnon(() => attempt(db, () => rows(db, sql)));
      assert.equal(outcome.ok, false);
      assert.match(outcome.ok ? "" : outcome.error, /permission denied/);
    });
  }

  test("reads no row from any tenant table", async () => {
    for (const table of ["vehicles", "customers", "reservations", "profiles", "system_settings"]) {
      const seen = await asAnon(() =>
        attempt(db, () => rows(db, `select 1 from public.${table} limit 1`)),
      );
      assert.equal(seen.ok && seen.value.length > 0, false, table);
    }
  });

  test("logged-in staff keep every function they could call (control)", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows<{ t: string; c: unknown }>(
          db,
          `select public.current_tenant_id() t, public.can_access_branch($1) c`,
          [id("b", "branch")],
        ),
      ),
    );
    assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    assert.deepEqual(outcome.ok ? outcome.value[0] : null, { t: B.tenant, c: true });
  });
});

describe("moving between dealerships", () => {
  /** B's owner has authored rows, which alone would block a move. A fresh admin proves the policy. */
  const FRESH_ADMIN = "eeeeeeee-0000-4000-8000-000000000001";

  const withFreshAdmin = async <T>(work: () => Promise<T>) => {
    await db.exec("begin");
    try {
      await db.query(`insert into auth.users (id, email) values ($1, 'fresh@example.test')`, [FRESH_ADMIN]);
      await db.query(`update public.profiles set status = 'active', tenant_id = $1 where id = $2`, [
        B.tenant,
        FRESH_ADMIN,
      ]);
      const [role] = await rows<{ id: string }>(db, `select id from public.roles where key = 'super_admin'`);
      await db.query(`insert into public.user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`, [
        B.tenant,
        FRESH_ADMIN,
        role.id,
      ]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [FRESH_ADMIN]);
      await db.exec("set local role authenticated");
      return await work();
    } finally {
      await db.exec("rollback");
    }
  };

  test("an admin cannot move their own profile to another dealership", async () => {
    await withFreshAdmin(async () => {
      const outcome = await attempt(db, () =>
        rows(db, `update public.profiles set tenant_id = $1 where id = $2 returning 1`, [
          A.tenant,
          FRESH_ADMIN,
        ]),
      );
      assert.equal(outcome.ok && outcome.value.length > 0, false);
      const [row] = await rows<{ t: string }>(db, `select public.current_tenant_id() t`);
      assert.equal(row.t, B.tenant);
    });
  });

  test("an admin cannot pull another dealership's person into their own", async () => {
    await withFreshAdmin(async () => {
      const outcome = await attempt(db, () =>
        rows(db, `update public.profiles set tenant_id = $1 where id = $2 returning 1`, [
          B.tenant,
          id("a", "plainUser"),
        ]),
      );
      assert.equal(outcome.ok && outcome.value.length > 0, false);
    });
  });

  test("someone removed from a dealership can still read their own profile", async () => {
    await db.exec("begin");
    try {
      await db.query(`delete from public.tenant_members where user_id = $1`, [B.user]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B.user]);
      await db.exec("set local role authenticated");
      assert.equal((await rows(db, `select 1 from public.profiles where id = $1`, [B.user])).length, 1);
      assert.equal((await rows(db, `select 1 from public.profiles where id <> $1`, [B.user])).length, 0);
      const write = await attempt(db, () =>
        rows(db, `update public.profiles set phone = '1' where id = $1 returning 1`, [B.user]),
      );
      assert.equal(write.ok && write.value.length > 0, false, "A removed member cannot write");
    } finally {
      await db.exec("rollback");
    }
  });

  test("someone with no dealership cannot aim an audit entry at one", async () => {
    await db.exec("begin");
    try {
      await db.query(`delete from public.tenant_members where user_id = $1`, [B.user]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B.user]);
      await db.exec("set local role authenticated");
      await rows(db, `select public.write_audit_log('forged2', 'x', null, null, $1::jsonb)`, [
        JSON.stringify({ tenant_id: A.tenant }),
      ]);
      const seen = await asSuperuser(db, () =>
        rows<{ tenant_id: string | null }>(db, `select tenant_id from public.audit_logs where action = 'forged2'`),
      );
      assert.deepEqual(seen, [{ tenant_id: null }]);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("rows that point at files or records", () => {
  const foreignPath = `${id("a", "vehicle")}/gallery/p.jpg`;

  test("a photo cannot name another dealership's file", async () => {
    const outcome = await insertAs(B.user, "vehicle_photos", {
      vehicle_id: id("b", "vehicle"),
      storage_path: foreignPath,
      category: "front",
      file_name: "x.jpg",
    });
    assert.equal(outcome.ok, false);
  });

  test("an existing photo cannot be re-pointed at another dealership's file", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(db, `update public.vehicle_photos set storage_path = $1 where id = $2 returning 1`, [
          foreignPath,
          id("b", "photo"),
        ]),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("even privileged code cannot store a photo with another dealership's file", async () => {
    await db.exec("begin");
    try {
      const outcome = await attempt(db, () =>
        rows(
          db,
          `insert into public.vehicle_photos (tenant_id, vehicle_id, storage_path, category, file_name)
           values ($1, $2, $3, 'front', 'x.jpg')`,
          [B.tenant, id("b", "vehicle"), foreignPath],
        ),
      );
      assert.equal(outcome.ok, false);
    } finally {
      await db.exec("rollback");
    }
  });

  test("a document cannot name another dealership's file", async () => {
    const outcome = await insertAs(B.user, "documents", {
      document_type_id: docTypeId,
      entity_type: "vehicles",
      entity_id: id("b", "vehicle"),
      storage_path: `${id("a", "vehicle")}/d.pdf`,
      file_name: "d.pdf",
      branch_id: id("b", "branch"),
    });
    assert.equal(outcome.ok, false);
  });

  test("a document cannot be attached to another dealership's record", async () => {
    const outcome = await insertAs(B.user, "documents", {
      document_type_id: docTypeId,
      entity_type: "vehicles",
      entity_id: id("a", "vehicle"),
      storage_path: `${id("b", "vehicle")}/d2.pdf`,
      file_name: "d2.pdf",
      branch_id: id("b", "branch"),
    });
    assert.equal(outcome.ok, false);
  });

  test("a path must start with a record ID and cannot climb out of its folder", async () => {
    for (const storage_path of ["../secret.jpg", `${id("b", "vehicle")}/../../x.jpg`, "gallery/x.jpg"]) {
      const outcome = await insertAs(B.user, "vehicle_photos", {
        vehicle_id: id("b", "vehicle"),
        storage_path,
        category: "front",
        file_name: "x.jpg",
      });
      assert.equal(outcome.ok, false, storage_path);
    }
  });

  test("a file name with two dots is fine (control)", async () => {
    const outcome = await insertAs(B.user, "vehicle_photos", {
      vehicle_id: id("b", "vehicle"),
      storage_path: `${id("b", "vehicle")}/gallery/front..view.jpg`,
      category: "front",
      file_name: "front..view.jpg",
    });
    assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  });

  test("split units can still share their original car's photos (control)", async () => {
    await db.exec("begin");
    try {
      await db.query(`update public.vehicles set quantity = 3 where id = $1`, [id("b", "vehicle")]);
      const [split] = await rows<{ id: string }>(db, `select public.split_vehicle_units($1, 1, $2) id`, [
        id("b", "vehicle"),
        B.user,
      ]);
      const photos = await rows<{ storage_path: string }>(
        db,
        `select storage_path from public.vehicle_photos where vehicle_id = $1`,
        [split.id],
      );
      assert.ok(photos.length > 0, "The split record should copy the photo rows");
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("files in each bucket", () => {
  const OBJECTS: [bucket: string, owner: (t: "a" | "b") => string][] = [
    ["vehicle-photos", (t) => id(t, "vehicle")],
    ["vehicle-documents", (t) => id(t, "vehicle")],
    ["customer-documents", (t) => id(t, "customer")],
    ["sales-documents", (t) => id(t, "sale")],
  ];

  before(async () => {
    for (const [bucket, owner] of OBJECTS) {
      for (const t of ["a", "b"] as const) {
        await db.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [
          bucket,
          `${owner(t)}/module-test.pdf`,
        ]);
      }
    }
  });

  for (const [bucket, owner] of OBJECTS) {
    const theirs = `${owner("a")}/module-test.pdf`;
    const mine = `${owner("b")}/module-test.pdf`;

    test(`${bucket}: the owner can read their file (control)`, async () => {
      const seen = await asUser(db, B.user, () =>
        rows(db, `select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, mine]),
      );
      assert.equal(seen.length, 1);
    });

    test(`${bucket}: the owner can upload (control)`, async () => {
      const outcome = await asUser(db, B.user, () =>
        attempt(db, () =>
          rows(db, `insert into storage.objects (bucket_id, name) values ($1, $2) returning 1`, [
            bucket,
            `${owner("b")}/uploaded.pdf`,
          ]),
        ),
      );
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    });

    test(`${bucket}: another dealership cannot read, overwrite, upload or delete`, async () => {
      await asUser(db, B.user, async () => {
        assert.equal(
          (await rows(db, `select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, theirs]))
            .length,
          0,
          "read",
        );
        const upload = await attempt(db, () =>
          rows(db, `insert into storage.objects (bucket_id, name) values ($1, $2)`, [
            bucket,
            `${owner("a")}/forged.pdf`,
          ]),
        );
        assert.equal(upload.ok, false, "upload");
        const moved = await attempt(db, () =>
          rows(db, `update storage.objects set name = $1 where bucket_id = $2 and name = $3 returning 1`, [
            `${owner("a")}/stolen.pdf`,
            bucket,
            mine,
          ]),
        );
        assert.equal(moved.ok && moved.value.length > 0, false, "moved into their folder");
        const removed = await rows(
          db,
          `delete from storage.objects where bucket_id = $1 and name = $2 returning 1`,
          [bucket, theirs],
        );
        assert.equal(removed.length, 0, "delete");
      });
    });
  }

  test("staff documents can only be reached by the server", async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('staff-documents', $1)`, [
      `${A.user}/id.pdf`,
    ]);
    const seen = await asUser(db, A.user, () =>
      rows(db, `select 1 from storage.objects where bucket_id = 'staff-documents'`),
    );
    assert.equal(seen.length, 0);
  });

  test("every bucket has the tenant rule", async () => {
    const [policy] = await rows<{ permissive: string; cmd: string }>(
      db,
      `select permissive, cmd from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_tenant_isolation'`,
    );
    assert.deepEqual(policy, { permissive: "RESTRICTIVE", cmd: "ALL" });
  });
});

describe("background work", () => {
  const overdue = () => db.exec(`update public.reservations set reserved_at = now() - interval '30 days'`);
  const statusOf = async (bookingId: string) =>
    (await rows<{ status: string }>(db, `select status from public.reservations where id = $1`, [bookingId]))[0]
      .status;

  test("a dealership's sweep touches only its own bookings", async () => {
    await db.exec("begin");
    try {
      await overdue();
      const [run] = await rows<{ n: number }>(db, `select public.cancel_unpaid_bookings($1) n`, [B.tenant]);
      assert.equal(run.n, 1, "Counts its own booking only");
      assert.equal(await statusOf(id("b", "reservation")), "cancelled");
      assert.equal(await statusOf(id("a", "reservation")), "active");
    } finally {
      await db.exec("rollback");
    }
  });

  test("the scheduled sweep still covers every dealership", async () => {
    await db.exec("begin");
    try {
      await overdue();
      const [run] = await rows<{ n: number }>(db, `select public.cancel_unpaid_bookings() n`);
      assert.equal(run.n, 2);
    } finally {
      await db.exec("rollback");
    }
  });

  test("the overdue sweep can run for one dealership", async () => {
    await db.exec("begin");
    try {
      await db.exec(`update public.reservations set selling_price = 9000`);
      await overdue();
      const [run] = await rows<{ n: number }>(db, `select public.notify_overdue_balances($1) n`, [B.tenant]);
      assert.equal(run.n, 1);
      const alerts = await rows<{ tenant_id: string }>(
        db,
        `select distinct tenant_id from public.notifications where type = 'booking_balance_overdue'`,
      );
      assert.deepEqual(alerts, [{ tenant_id: B.tenant }]);
    } finally {
      await db.exec("rollback");
    }
  });

  test("logged-in staff cannot run a sweep directly", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () => rows(db, `select public.cancel_unpaid_bookings($1)`, [B.tenant])),
    );
    assert.equal(outcome.ok, false);
  });

  test("record numbers stay per dealership under the service role", async () => {
    await db.exec("begin");
    try {
      const [made] = await rows<{ stock_number: string }>(
        db,
        `insert into public.vehicles (make, model, year, mileage, branch_id, source, status)
         values ('A', 'B', 2024, 1, $1, 'other', 'acquired') returning stock_number`,
        [id("b", "branch")],
      );
      assert.match(made.stock_number, /^SD-/);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("alert recipients follow branch access", () => {
  const person = (branchId: string | null, ...roles: [string | null, string | null][]) => ({
    id: "p",
    branchId,
    roles: roles.map(([key, roleBranch]) => ({ key, branchId: roleBranch })),
  });

  test("an all-branch role reaches every branch", () => {
    assert.equal(canReachBranch(person("x", ["sales", null]), "y"), true);
  });
  test("a branch role reaches only its branch", () => {
    assert.equal(canReachBranch(person("x", ["sales", "x"]), "x"), true);
    assert.equal(canReachBranch(person("x", ["sales", "x"]), "y"), false);
  });
  test("a Super Admin reaches every branch, even with a branch on the role", () => {
    assert.equal(canReachBranch(person("x", ["super_admin", "x"]), "y"), true);
  });
  test("a person with no role reaches only their home branch", () => {
    assert.equal(canReachBranch(person("x"), "x"), true);
    assert.equal(canReachBranch(person("x"), "y"), false);
    assert.equal(canReachBranch(person(null), "y"), false);
  });
});

/**
 * PGlite has no PostgREST, so a select the API would reject still passes every other test here.
 * This applies PostgREST's documented relationship rules to the real catalog. It models the API
 * rather than running it, so run postgrest-stack.sh too before release.
 */
describe("every select in the code resolves against the schema", () => {
  type Key = { name: string; from: string; to: string; columns: string[] };
  let keys: Key[];
  let columns: Map<string, Set<string>>;

  before(async () => {
    keys = (
      await rows<{ name: string; from: string; to: string; columns: string[] }>(
        db,
        `select c.conname as name, f.relname as "from", t.relname as "to",
           (select array_agg(a.attname::text order by k.ord)
            from unnest(c.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns
         from pg_constraint c
         join pg_class f on f.oid = c.conrelid
         join pg_class t on t.oid = c.confrelid
         where c.contype = 'f' and c.connamespace = 'public'::regnamespace
           and t.relnamespace = 'public'::regnamespace`,
      )
    ).map((key) => ({ ...key }));
    columns = new Map();
    for (const row of await rows<{ t: string; c: string }>(
      db,
      `select table_name t, column_name c from information_schema.columns where table_schema = 'public'`,
    )) {
      columns.set(row.t, (columns.get(row.t) ?? new Set()).add(row.c));
    }
  });

  /** The table an embed reaches, or a reason it would be rejected. */
  const resolveEmbed = (source: string, embed: Extract<SelectItem, { kind: "embed" }>) => {
    const { target, hint } = embed;
    // `branches:branch_id (...)`: the target is a column, which only matches a single-column key.
    const byColumn = keys.filter(
      (key) => key.from === source && key.columns.length === 1 && key.columns[0] === target,
    );
    if (!columns.has(target)) {
      if (hint) return { error: `${target} is not a table` };
      if (byColumn.length === 1) return { table: byColumn[0].to };
      return { error: `no single-column key on ${source}.${target}; composite keys need their constraint name` };
    }
    const candidates = keys.filter(
      (key) => (key.from === source && key.to === target) || (key.from === target && key.to === source),
    );
    const matching = hint ? candidates.filter((key) => key.name === hint) : candidates;
    if (matching.length === 0) return { error: `no relationship from ${source} to ${target}${hint ? ` named ${hint}` : ""}` };
    if (matching.length > 1) return { error: `ambiguous: ${matching.map((key) => key.name).join(", ")}` };
    return { table: target };
  };

  const problems = (table: string, items: SelectItem[]): string[] =>
    items.flatMap((item) => {
      if (item.kind === "column") {
        return item.name === "*" || columns.get(table)?.has(item.name)
          ? []
          : [`${table} has no column ${item.name}`];
      }
      const resolved = resolveEmbed(table, item);
      if (resolved.error) return [resolved.error];
      return problems(resolved.table!, item.children);
    });

  test("the rules reject the embed form composite keys break (control)", () => {
    assert.deepEqual(
      problems("vehicles", parseSelect("id, branches:branch_id ( id, name )")).length,
      1,
    );
    assert.deepEqual(problems("vehicles", parseSelect("id, branches!vehicles_branch_id_fkey ( id, name )")), []);
    assert.deepEqual(problems("vehicles", parseSelect("id, vehicle_models:model_id ( vehicle_type )")), []);
    assert.equal(problems("vehicles", parseSelect("no_such_column")).length, 1);
  });

  test("found the selects (control)", () => {
    const selects = selectsInSource();
    assert.ok(selects.length > 40, `Found only ${selects.length}`);
    assert.ok(selects.some((s) => s.select.includes("branches!vehicles_branch_id_fkey")));
  });

  test("none would be rejected", () => {
    const failures = selectsInSource().flatMap(({ table, select, file }) =>
      problems(table, parseSelect(select)).map((problem) => `${file}: ${problem}`),
    );
    assert.deepEqual(failures, []);
  });
});

describe("source guards", () => {
  const sourceFiles = () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(path)) files.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    return files;
  };
  const relative = (file: string) => file.slice(process.cwd().length + 1);

  test("no embed names a composite key by its column, which PostgREST cannot resolve", () => {
    // These keys include tenant_id. PostgREST matches a column hint on single-column keys only,
    // so `branches:branch_id (...)` fails at runtime. Name the constraint instead.
    const composite = "(branches|vehicles|customers|profiles|acquisitions|suppliers|branch_locations|documents|reservations|vehicle_pricing)";
    const pattern = new RegExp(`\\b${composite}(:|!)[a-z_]+_(id|by)\\b`);
    const offenders = sourceFiles()
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map(relative);
    assert.deepEqual(offenders, []);
  });

  test("only the shared catalog is read through Drizzle", () => {
    // The Drizzle models have no tenant_id, and a Drizzle query on a tenant table would have
    // nothing but RLS to rely on. Update the models before relaxing this.
    const users = sourceFiles()
      .filter((file) => !relative(file).startsWith("src/lib/db/"))
      .filter((file) => /@\/lib\/db\b|@\/lib\/db\//.test(readFileSync(file, "utf8")))
      .map(relative);
    assert.deepEqual(users, ["src/lib/vehicles/catalog.ts"]);
    const catalog = readFileSync(join(process.cwd(), "src/lib/vehicles/catalog.ts"), "utf8");
    const imported = catalog.match(/import \{([^}]*)\} from "@\/lib\/db\/schema"/)?.[1] ?? "";
    assert.deepEqual(imported.split(",").map((name) => name.trim()).filter(Boolean), ["vehicleMakes"]);
  });

  test("no client component holds the service-role client", () => {
    const offenders = sourceFiles()
      .filter((file) => readFileSync(file, "utf8").startsWith('"use client"'))
      .filter((file) => /lib\/server\/privileged|platformClient|tenantClient/.test(readFileSync(file, "utf8")))
      .map(relative);
    assert.deepEqual(offenders, []);
  });

  test("privileged code can't be bundled into the browser", () => {
    for (const file of ["index.ts", "members.ts", "client.ts"]) {
      const source = readFileSync(join(process.cwd(), "src/lib/server/privileged", file), "utf8");
      assert.match(source, /import "server-only"/, file);
    }
  });

  test("no secret is exposed under a public prefix", () => {
    const offenders = sourceFiles()
      .filter((file) => /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|PRIVATE)/.test(readFileSync(file, "utf8")))
      .map(relative);
    assert.deepEqual(offenders, []);
  });
});
