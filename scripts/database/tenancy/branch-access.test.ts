import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asSuperuser, asUser, attempt, createDatabase, rows } from "./harness";
import { ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/**
 * Branch-level access inside one dealership. The attacker holds every permission, limited to
 * branch 1, so only the branch boundary can stop them. Each attack has an own-branch control
 * proving the call really works, so nothing passes merely because the call was broken.
 */
const uuid = (n: number) => `dddddddd-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const BRANCH_USER = uuid(1);
const ALL_BRANCH_USER = uuid(2);
const HOME_ONLY_USER = uuid(3);
const OTHER = {
  branch: uuid(10),
  location: uuid(11),
  vehicle: uuid(12),
  photo: uuid(13),
  expense: uuid(14),
  pricing: uuid(15),
  acquisition: uuid(16),
  reservation: uuid(17),
  sale: uuid(18),
  document: uuid(19),
  customer: uuid(20),
  statusHistory: uuid(21),
  pricingHistory: uuid(22),
  acquisitionHistory: uuid(23),
};
const OWN = { vehicle: id("a", "vehicle"), branch: id("a", "branch") };

let db: PGlite;

/** Every tenant table insert in one place, with the tenant stated. */
async function put(table: string, row: Record<string, unknown>) {
  const values = { tenant_id: ZOHAAN_TENANT_ID, ...row };
  const columns = Object.keys(values);
  await db.query(
    `insert into public.${table} (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(values),
  );
}

async function addUser(userId: string, email: string, branchId: string) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, email]);
  await db.query(`update public.profiles set status = 'active', branch_id = $1, tenant_id = $2 where id = $3`, [
    branchId,
    ZOHAAN_TENANT_ID,
    userId,
  ]);
  await db.query(
    `insert into public.tenant_members (tenant_id, user_id, status) values ($1, $2, 'active') on conflict do nothing`,
    [ZOHAAN_TENANT_ID, userId],
  );
}

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");

  await put("branches", {
    id: OTHER.branch,
    name: "Other branch",
    code: "BR-OTHER",
    emirate: "dubai",
    address_line_1: "Road",
    city: "Dubai",
  });
  await put("branch_locations", { id: OTHER.location, branch_id: OTHER.branch, name: "Yard 2" });
  await put("vehicles", {
    id: OTHER.vehicle,
    stock_number: "STK-OTHER",
    make: "Toyota",
    model: "Camry",
    year: 2024,
    mileage: 100,
    branch_id: OTHER.branch,
    source: "other",
    status: "ready_for_sale",
    total_acquisition_cost: 1000,
    minimum_selling_price: 5000,
  });
  await put("vehicle_photos", {
    id: OTHER.photo,
    vehicle_id: OTHER.vehicle,
    storage_path: `${OTHER.vehicle}/gallery/p.jpg`,
    category: "front",
    file_name: "p.jpg",
  });
  await put("vehicle_pricing", { id: OTHER.pricing, vehicle_id: OTHER.vehicle });
  await put("vehicle_pricing_history", { id: OTHER.pricingHistory, vehicle_id: OTHER.vehicle });
  await put("vehicle_status_history", {
    id: OTHER.statusHistory,
    vehicle_id: OTHER.vehicle,
    new_status: "ready_for_sale",
  });
  await put("acquisitions", {
    id: OTHER.acquisition,
    vehicle_id: OTHER.vehicle,
    branch_id: OTHER.branch,
    purchase_price: 1000,
    source_type: "dealer",
    acquisition_number: "ACQ-OTHER",
    status: "draft",
  });
  await put("acquisition_status_history", {
    id: OTHER.acquisitionHistory,
    acquisition_id: OTHER.acquisition,
    new_status: "draft",
  });
  await put("vehicle_expenses", {
    id: OTHER.expense,
    vehicle_id: OTHER.vehicle,
    category: "other",
    amount: 250,
    expense_date: "2026-01-01",
  });
  await put("vehicle_expenses", {
    id: uuid(24),
    vehicle_id: OTHER.vehicle,
    acquisition_id: OTHER.acquisition,
    category: "other",
    amount: 300,
    expense_date: "2026-01-01",
  });
  await put("customers", {
    id: OTHER.customer,
    customer_code: "CUS-OTHER",
    first_name: "Other",
    last_name: "Customer",
    display_name: "Other Customer",
    phone: "+971500001111",
    branch_id: OTHER.branch,
  });
  await put("reservations", {
    id: OTHER.reservation,
    reservation_number: "BK-OTHER",
    vehicle_id: OTHER.vehicle,
    customer_id: OTHER.customer,
    branch_id: OTHER.branch,
    amount: 0,
    status: "active",
  });
  await put("sales", {
    id: OTHER.sale,
    sale_number: "SL-OTHER",
    vehicle_id: OTHER.vehicle,
    customer_id: OTHER.customer,
    branch_id: OTHER.branch,
    status: "quotation",
    vehicle_price: 5000,
    final_amount: 5000,
  });
  const [docType] = await rows<{ id: string }>(db, `select id from public.document_types where key = 'test'`);
  await put("documents", {
    id: OTHER.document,
    document_type_id: docType.id,
    entity_type: "vehicle",
    entity_id: OTHER.vehicle,
    storage_path: `${OTHER.vehicle}/d.pdf`,
    file_name: "d.pdf",
    branch_id: OTHER.branch,
  });
  await db.query(`insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)`, [
    `${OTHER.vehicle}/gallery/p.jpg`,
  ]);

  // Permission rows come from seed.sql, which migrations do not run: load every key they check.
  const migrations = join(process.cwd(), "supabase/migrations");
  const keys = new Set<string>();
  for (const file of readdirSync(migrations)) {
    const sql = readFileSync(join(migrations, file), "utf8");
    for (const match of sql.matchAll(/has_permission(?:_for_(?:optional_)?branch)?\(\s*'([a-z_.]+)'/g)) {
      keys.add(match[1]);
    }
  }
  for (const key of keys) {
    await db.query(
      `insert into public.permissions (key, name, module) values ($1, $1, split_part($1, '.', 1)) on conflict (key) do nothing`,
      [key],
    );
  }

  await db.exec(`insert into public.roles (key, name) values ('test_everything', 'Everything')`);
  await db.exec(`insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'test_everything'`);
  const [role] = await rows<{ id: string }>(db, `select id from public.roles where key = 'test_everything'`);

  await addUser(BRANCH_USER, "branch-user@example.test", OWN.branch);
  await put("user_roles", { user_id: BRANCH_USER, role_id: role.id, branch_id: OWN.branch });
  // Booking lists also need a role that sees everyone's bookings, not only a permission.
  await db.exec(`insert into public.roles (key, name) values ('accountant', 'Accountant') on conflict (key) do nothing`);
  const [manager] = await rows<{ id: string }>(db, `select id from public.roles where key = 'accountant'`);
  await put("user_roles", { user_id: BRANCH_USER, role_id: manager.id, branch_id: OWN.branch });
  await addUser(ALL_BRANCH_USER, "all-branches@example.test", OWN.branch);
  await put("user_roles", { user_id: ALL_BRANCH_USER, role_id: role.id, branch_id: null });
  await put("user_roles", { user_id: ALL_BRANCH_USER, role_id: manager.id, branch_id: null });
  await addUser(HOME_ONLY_USER, "no-roles@example.test", OTHER.branch);
});

after(async () => {
  await db?.close();
});

const VISIBILITY: [table: string, ownId: string, otherId: string][] = [
  ["vehicles", OWN.vehicle, OTHER.vehicle],
  ["vehicle_photos", id("a", "photo"), OTHER.photo],
  ["vehicle_expenses", id("a", "looseExpense"), OTHER.expense],
  ["vehicle_pricing", id("a", "pricing"), OTHER.pricing],
  ["vehicle_pricing_history", id("a", "pricingHistory"), OTHER.pricingHistory],
  ["vehicle_status_history", id("a", "statusHistory"), OTHER.statusHistory],
  ["acquisitions", id("a", "acquisition"), OTHER.acquisition],
  ["acquisition_status_history", id("a", "acquisitionHistory"), OTHER.acquisitionHistory],
  ["reservations", id("a", "reservation"), OTHER.reservation],
  ["sales", id("a", "sale"), OTHER.sale],
  ["documents", id("a", "document"), OTHER.document],
  ["branch_locations", id("a", "location"), OTHER.location],
  ["customers", id("a", "customer"), OTHER.customer],
];

describe("rows of another branch", () => {
  for (const [table, ownId, otherId] of VISIBILITY) {
    test(`${table}: own branch is readable (control)`, async () => {
      const seen = await asUser(db, BRANCH_USER, () =>
        rows(db, `select 1 from public.${table} where id = $1`, [ownId]),
      );
      assert.equal(seen.length, 1);
    });

    test(`${table}: another branch is hidden`, async () => {
      const seen = await asUser(db, BRANCH_USER, () =>
        rows(db, `select 1 from public.${table} where id = $1`, [otherId]),
      );
      assert.equal(seen.length, 0);
    });

    test(`${table}: another branch cannot be updated or deleted`, async () => {
      const outcome = await asUser(db, BRANCH_USER, async () => {
        const updated = await attempt(db, () =>
          rows(db, `update public.${table} set id = id where id = $1 returning 1`, [otherId]),
        );
        const deleted = await attempt(db, () =>
          rows(db, `delete from public.${table} where id = $1 returning 1`, [otherId]),
        );
        return [updated, deleted];
      });
      for (const result of outcome) assert.equal(result.ok && result.value.length > 0, false);
    });

    test(`${table}: an all-branches role sees both (control)`, async () => {
      const seen = await asUser(db, ALL_BRANCH_USER, () =>
        rows(db, `select 1 from public.${table} where id = any($1::uuid[])`, [[ownId, otherId]]),
      );
      assert.equal(seen.length, 2);
    });
  }

  test("a person with no role sees only their home branch", async () => {
    const [own, other] = await asUser(db, HOME_ONLY_USER, async () => [
      await rows<{ ok: boolean }>(db, `select public.can_access_branch($1) ok`, [OTHER.branch]),
      await rows<{ ok: boolean }>(db, `select public.can_access_branch($1) ok`, [OWN.branch]),
    ]);
    assert.equal(own[0].ok, true);
    assert.equal(other[0].ok, false);
  });

  test("a new vehicle cannot be placed in another branch", async () => {
    const outcome = await asUser(db, BRANCH_USER, () =>
      attempt(db, () =>
        rows(
          db,
          `insert into public.vehicles (make, model, year, mileage, branch_id, source, status)
           values ('A', 'B', 2024, 1, $1, 'other', 'acquired')`,
          [OTHER.branch],
        ),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("a car cannot be moved to a branch the user has no access to", async () => {
    const outcome = await asUser(db, BRANCH_USER, () =>
      attempt(db, () =>
        rows(db, `select public.transfer_vehicle($1, $2, null, 'x')`, [OWN.vehicle, OTHER.branch]),
      ),
    );
    assert.equal(outcome.ok, false);
  });
});

/** Read functions must raise, or return nothing useful, for the other branch's record. */
const reads = (v: string, a: string, s: string, c: string): Record<string, string> => ({
  can_access_customer_storage: `select public.can_access_customer_storage('${c}', false)`,
  can_access_sale_storage: `select public.can_access_sale_storage('${s}', false)`,
  can_access_vehicle_document_storage: `select public.can_access_vehicle_document_storage('${v}', false)`,
  can_access_vehicle_storage: `select public.can_access_vehicle_storage('${v}', false)`,
  get_vehicle_cost_breakdown: `select public.get_vehicle_cost_breakdown('${v}')`,
  get_vehicle_profitability: `select public.get_vehicle_profitability('${v}', 9000)`,
  get_vehicle_total_cost: `select public.get_vehicle_total_cost('${v}')`,
  read_acquisition_costs: `select public.read_acquisition_costs('${a}')`,
  read_acquisitions_costs: `select * from public.read_acquisitions_costs(array['${a}']::uuid[])`,
  read_vehicle_costs: `select public.read_vehicle_costs('${v}')`,
  read_vehicle_profit: `select public.read_vehicle_profit('${v}')`,
  evaluate_vehicle_ready_for_sale: `select public.evaluate_vehicle_ready_for_sale('${v}')`,
  acquisition_expense_sum: `select public.acquisition_expense_sum('${a}')`,
  acquisition_total_cost: `select public.acquisition_total_cost('${a}')`,
  vehicle_other_expense_cost: `select public.vehicle_other_expense_cost('${v}')`,
  vehicle_root_id: `select public.vehicle_root_id('${v}')`,
});

const uselessResult = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  (typeof value !== "object" && value !== true && Number(value) === 0) ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && "error" in value);

describe("functions pointed at another branch", () => {
  const own = reads(OWN.vehicle, id("a", "acquisition"), id("a", "sale"), id("a", "customer"));
  const other = reads(OTHER.vehicle, OTHER.acquisition, OTHER.sale, OTHER.customer);

  for (const name of Object.keys(other)) {
    test(`${name}: own branch answers (control)`, async () => {
      const outcome = await asUser(db, BRANCH_USER, () =>
        attempt(db, () => rows<Record<string, unknown>>(db, own[name])),
      );
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
      const values = outcome.ok ? outcome.value.flatMap((row) => Object.values(row)) : [];
      assert.ok(!values.every(uselessResult), `Returned ${JSON.stringify(values)}`);
    });

    test(`${name}: another branch reveals nothing`, async () => {
      const outcome = await asUser(db, BRANCH_USER, () =>
        attempt(db, () => rows<Record<string, unknown>>(db, other[name])),
      );
      if (!outcome.ok) return;
      const values = outcome.value.flatMap((row) => Object.values(row));
      assert.ok(values.every(uselessResult), `Returned ${JSON.stringify(values)}`);
    });
  }

  const toStatus = (acquisition: string, ...statuses: string[]) =>
    statuses.map((s) => `update public.acquisitions set status = '${s}' where id = '${acquisition}'`);

  /** `make` builds the call for a given vehicle, acquisition and pricing row. */
  const WRITES: Record<
    string,
    {
      call: (v: string, a: string) => string;
      table: string;
      target: (ids: { v: string; a: string; pricing: string; photo: string }) => string;
      setup?: (ids: { v: string; a: string; pricing: string }) => string[];
    }
  > = {
    approve_acquisition: {
      call: (_, a) => `public.approve_acquisition('${a}', 'x')`,
      table: "acquisitions",
      target: ({ a }) => a,
      setup: ({ a }) => toStatus(a, "sourcing", "negotiating", "pending_approval"),
    },
    reject_acquisition: {
      call: (_, a) => `public.reject_acquisition('${a}', 'x')`,
      table: "acquisitions",
      target: ({ a }) => a,
      setup: ({ a }) => toStatus(a, "sourcing", "negotiating", "pending_approval"),
    },
    cancel_acquisition: {
      call: (_, a) => `public.cancel_acquisition('${a}', 'x')`,
      table: "acquisitions",
      target: ({ a }) => a,
    },
    change_acquisition_status: {
      call: (_, a) => `public.change_acquisition_status('${a}', 'sourcing', 'x')`,
      table: "acquisitions",
      target: ({ a }) => a,
    },
    upsert_vehicle_pricing: {
      call: (v) =>
        `public.upsert_vehicle_pricing('${v}', p_minimum_selling_price => 1, p_target_selling_price => 2, p_advertised_price => 3, p_current_selling_price => 3)`,
      table: "vehicle_pricing",
      target: ({ pricing }) => pricing,
    },
    approve_vehicle_pricing: {
      call: (v) => `public.approve_vehicle_pricing('${v}', 'x', true)`,
      table: "vehicle_pricing",
      target: ({ pricing }) => pricing,
      setup: ({ pricing }) => [
        `update public.vehicle_pricing set pricing_status = 'pending_approval' where id = '${pricing}'`,
      ],
    },
    archive_vehicle: {
      call: (v) => `public.archive_vehicle('${v}', 'x')`,
      table: "vehicles",
      target: ({ v }) => v,
    },
    change_vehicle_status: {
      call: (v) => `public.change_vehicle_status('${v}', 'reserved', 'x')`,
      table: "vehicles",
      target: ({ v }) => v,
    },
    transfer_vehicle: {
      call: (v) => `public.transfer_vehicle('${v}', '${OWN.branch}', null, 'x')`,
      table: "vehicles",
      target: ({ v }) => v,
    },
    update_vehicle_costs: {
      call: (v) => `public.update_vehicle_costs('${v}', 1, 1)`,
      table: "vehicles",
      target: ({ v }) => v,
    },
    set_vehicle_photo_primary: {
      call: () => "", // Takes the photo ID: built in run().
      table: "vehicle_photos",
      target: ({ photo }) => photo,
    },
  };

  const ownIds = {
    v: OWN.vehicle,
    a: id("a", "acquisition"),
    pricing: id("a", "pricing"),
    photo: id("a", "photo"),
  };
  const otherIds = { v: OTHER.vehicle, a: OTHER.acquisition, pricing: OTHER.pricing, photo: OTHER.photo };

  const run = (name: string, ids: typeof ownIds) => {
    const spec = WRITES[name];
    const target = spec.target(ids);
    const call =
      name === "set_vehicle_photo_primary"
        ? `public.set_vehicle_photo_primary('${ids.photo}')`
        : spec.call(ids.v, ids.a);
    const snapshot = () =>
      asSuperuser(db, async () =>
        JSON.stringify(await rows(db, `select to_jsonb(t) r from public.${spec.table} t where id = $1`, [target])),
      );
    return asUser(db, BRANCH_USER, async () => {
      await asSuperuser(db, async () => {
        await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
        for (const statement of spec.setup?.(ids) ?? []) await db.exec(statement);
        await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [BRANCH_USER]);
      });
      const before = await snapshot();
      const outcome = await attempt(db, () => rows(db, `select ${call}`));
      return { outcome, changed: (await snapshot()) !== before };
    });
  };

  for (const name of Object.keys(WRITES)) {
    test(`${name}: own branch works (control)`, async () => {
      const { outcome, changed } = await run(name, ownIds);
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
      assert.equal(changed, true, "The call succeeded but changed nothing");
    });

    test(`${name}: another branch changes nothing`, async () => {
      const { changed } = await run(name, otherIds);
      assert.equal(changed, false);
    });
  }
});

describe("files of another branch", () => {
  const otherPath = `${OTHER.vehicle}/gallery/p.jpg`;
  const ownPath = `${OWN.vehicle}/gallery/p.jpg`;

  test("own branch's file is readable (control)", async () => {
    const seen = await asUser(db, BRANCH_USER, () =>
      rows(db, `select 1 from storage.objects where name = $1`, [ownPath]),
    );
    assert.equal(seen.length, 1);
  });

  test("another branch's file is hidden", async () => {
    const seen = await asUser(db, BRANCH_USER, () =>
      rows(db, `select 1 from storage.objects where name = $1`, [otherPath]),
    );
    assert.equal(seen.length, 0);
  });

  test("nothing can be uploaded into another branch's folder", async () => {
    const outcome = await asUser(db, BRANCH_USER, () =>
      attempt(db, () =>
        rows(db, `insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)`, [
          `${OTHER.vehicle}/gallery/forged.jpg`,
        ]),
      ),
    );
    assert.equal(outcome.ok, false);
  });
});
