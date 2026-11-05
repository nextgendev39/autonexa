import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import {
  LAST_SINGLE_TENANT_MIGRATION,
  applyMigrations,
  asSuperuser,
  asUser,
  attempt,
  createDatabase,
  exists,
  rows,
} from "./harness";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";
import { PLATFORM_FUNCTIONS, SELF_SCOPED_FUNCTIONS } from "./platform-attacks";

/** Every public table must be classified; an unclassified new table fails the guard test. */
const TENANT_TABLES: Record<
  string,
  { key: string; seed: Parameters<typeof id>[1] | null; column?: string; scope?: string }
> = {
  branches: { key: "id", seed: "branch" },
  branch_locations: { key: "id", seed: "location" },
  profiles: { key: "id", seed: "profile" },
  user_roles: { key: "id", seed: "userRole" },
  customers: { key: "id", seed: "customer" },
  suppliers: { key: "id", seed: "supplier" },
  vehicles: { key: "id", seed: "vehicle" },
  vehicle_photos: { key: "id", seed: "photo" },
  vehicle_expenses: { key: "id", seed: "expense" },
  vehicle_pricing: { key: "id", seed: "pricing" },
  vehicle_pricing_history: { key: "id", seed: "pricingHistory" },
  vehicle_status_history: { key: "id", seed: "statusHistory" },
  vehicle_share_links: { key: "id", seed: "shareLink" },
  acquisitions: { key: "id", seed: "acquisition" },
  acquisition_status_history: { key: "id", seed: "acquisitionHistory" },
  reservations: { key: "id", seed: "reservation" },
  sales: { key: "id", seed: "sale" },
  documents: { key: "id", seed: "document" },
  staff_documents: { key: "id", seed: "staffDocument" },
  notifications: { key: "id", seed: "notification" },
  push_subscriptions: { key: "id", seed: "push" },
  audit_logs: { key: "id", seed: "auditLog" },
  // Every dealership may hold this key, so "A's row" also needs the tenant to pick it out.
  system_settings: { key: "key", seed: null, scope: `tenant_id = '${ZOHAAN_TENANT_ID}'` },
};

/** Shared across dealerships: no tenant_id, and only platform admins may change them. */
const SHARED_TABLES = [
  "permissions",
  "roles",
  "role_permissions",
  "document_types",
  "vehicle_makes",
  "vehicle_models",
  "vehicle_model_years",
  "vehicle_variants",
  "email_verification_otps",
  "password_reset_otps",
];

/** Platform tables introduced by the tenancy migrations. */
const PLATFORM_TABLES = [
  "tenants",
  "tenant_members",
  "platform_admins",
  "tenant_counters",
  // Phase 3: tested in platform.test.ts.
  "platform_role_permissions",
  "platform_audit_logs",
  "plans",
  "platform_features",
  "plan_features",
  "tenant_subscriptions",
  "subscription_invoices",
  "subscription_transactions",
  "tenant_settings",
  "tenant_domains",
  // Phase 4: tested in storefront.test.ts.
  "storefronts",
  "storefront_enquiries",
  "storefront_events",
  "storefront_rate_limits",
  // Phase 5: tested in billing.test.ts.
  "plan_prices",
  "billing_tax_rates",
  "billing_entities",
  "tenant_billing_profiles",
  "billing_checkouts",
  "billing_webhook_events",
  "billing_email_outbox",
];

/** Tables with no client policies: the app reaches them through privileged server code. */
const SERVICE_ONLY_TABLES = ["vehicle_share_links", "push_subscriptions"];

const A = { user: id("a", "profile"), tenant: ZOHAAN_TENANT_ID };
const B = { user: id("b", "profile"), tenant: SECOND_TENANT_ID };
const rowKey = (table: string) =>
  TENANT_TABLES[table].seed ? id("a", TENANT_TABLES[table].seed!) : "test.marker";
/** Picks out tenant A's row by its key. */
const targetsRow = (table: string) => {
  const { key, scope } = TENANT_TABLES[table];
  return `${key} = $1${scope ? ` and ${scope}` : ""}`;
};

let db: PGlite;

async function requireTenancy() {
  assert.ok(
    await exists(db, "public.current_tenant_id"),
    "Tenancy is not installed: public.current_tenant_id() does not exist.",
  );
}

async function tenantColumnExists(table: string) {
  const [row] = await rows<{ found: boolean }>(
    db,
    `select exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = $1 and column_name = 'tenant_id') as found`,
    [table],
  );
  return row.found;
}

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");
});

after(async () => {
  await db?.close();
});

describe("guards: nothing new can skip isolation", () => {
  test("every public table is classified", async () => {
    const tables = (
      await rows<{ t: string }>(
        db,
        `select c.relname t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`,
      )
    ).map((r) => r.t);
    const known = new Set([...Object.keys(TENANT_TABLES), ...SHARED_TABLES, ...PLATFORM_TABLES]);
    assert.deepEqual(
      tables.filter((t) => !known.has(t)),
      [],
      "Unclassified tables",
    );
  });

  for (const table of Object.keys(TENANT_TABLES)) {
    test(`${table} has tenant_id and a restrictive tenant policy`, async () => {
      assert.ok(await tenantColumnExists(table), `${table} has no tenant_id`);
      const policies = await rows<{ qual: string | null; wc: string | null }>(
        db,
        `select pg_get_expr(polqual, polrelid) qual, pg_get_expr(polwithcheck, polrelid) wc
         from pg_policy where polrelid = ('public.' || $1)::regclass and not polpermissive and polcmd = '*'`,
        [table],
      );
      assert.ok(
        policies.some(
          (p) => p.qual?.includes("current_tenant_id") && p.wc?.includes("current_tenant_id"),
        ),
        `${table} has no restrictive policy using current_tenant_id() for reads and writes`,
      );
    });
  }

  test("every logged-in-callable definer function taking an ID is in the attack matrix", async () => {
    const callable = (
      await rows<{ n: string }>(
        db,
        `select distinct p.proname n from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
           and p.prorettype <> 'trigger'::regtype
           and pg_get_function_identity_arguments(p.oid) ~ 'uuid'
           and has_function_privilege('authenticated', p.oid, 'execute')`,
      )
    ).map((r) => r.n);
    const covered = new Set([
      ...Object.keys(READ_ATTACKS),
      ...Object.keys(WRITE_ATTACKS),
      "write_audit_log",
      ...PLATFORM_FUNCTIONS,
      ...SELF_SCOPED_FUNCTIONS,
    ]);
    assert.deepEqual(
      callable.filter((n) => !covered.has(n)),
      [],
      "Definer functions with no attack test",
    );
  });

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
  const PRIVILEGED = /^src\/lib\/server\/privileged\//;

  test("the raw service-role client exists only inside the privileged module", () => {
    const offenders = sourceFiles()
      .filter((file) => !PRIVILEGED.test(relative(file)))
      .filter((file) =>
        /lib\/supabase\/admin|privileged\/client|SUPABASE_SERVICE_ROLE_KEY|createPrivilegedClient/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map(relative);
    assert.deepEqual(offenders, [], "Service-role access outside the privileged module");
  });

  test("the cross-dealership client is used only by the reviewed allowlist", () => {
    const allowed = [
      "src/lib/auth/email-verification-server.ts",
      "src/lib/auth/password-reset-server.ts",
      "src/lib/auth/service.ts",
      "src/lib/notifications/push.ts",
      "src/lib/notifications/service.ts",
      "src/lib/profile/service.ts",
      "src/lib/vehicles/share.ts",
    ];
    const users = sourceFiles()
      .filter((file) => !PRIVILEGED.test(relative(file)))
      .filter((file) => /\bplatformClient\b/.test(readFileSync(file, "utf8")))
      .map(relative)
      .sort();
    assert.deepEqual(users, allowed);
  });

  test("no route or service reads every auth user", () => {
    const offenders = sourceFiles()
      .filter((file) => /auth\.admin\.listUsers/.test(readFileSync(file, "utf8")))
      .map(relative);
    assert.deepEqual(offenders, []);
  });

  test("the tenant never comes from a request", () => {
    const offenders = sourceFiles()
      .filter((file) => /src\/app\/api\/|src\/lib\/validation\//.test(file))
      .filter((file) => /tenantId|tenant_id/.test(readFileSync(file, "utf8")))
      .map(relative);
    assert.deepEqual(offenders, [], "Routes and request schemas must not mention a tenant");
  });

  test("login details for a dealership cannot be read by logged-in users", async () => {
    await requireTenancy();
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(db, `select * from public.tenant_member_auth_details($1)`, [A.tenant]),
      ),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("active tenant comes only from membership", () => {
  test("each user resolves to their own dealership", async () => {
    await requireTenancy();
    for (const [user, tenant] of [
      [A.user, A.tenant],
      [B.user, B.tenant],
    ]) {
      const [row] = await asUser(db, user, () =>
        rows<{ t: string }>(db, `select public.current_tenant_id() t`),
      );
      assert.equal(row.t, tenant);
    }
  });

  test("forged JWT claims and session settings cannot change the tenant", async () => {
    await requireTenancy();
    const [row] = await asUser(
      db,
      B.user,
      async () => {
        await db.exec(`set local app.tenant_id = '${A.tenant}'`);
        return rows<{ t: string }>(db, `select public.current_tenant_id() t`);
      },
      {
        tenant_id: A.tenant,
        app_metadata: { tenant_id: A.tenant },
        user_metadata: { tenant_id: A.tenant },
      },
    );
    assert.equal(row.t, B.tenant);
  });

  test("a removed member loses access immediately", async () => {
    await requireTenancy();
    await db.exec("begin");
    try {
      await db.query(`delete from public.tenant_members where user_id = $1`, [B.user]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B.user]);
      await db.exec("set local role authenticated");
      const seen = await rows(db, `select id from public.vehicles`);
      const [row] = await rows<{ t: string | null }>(db, `select public.current_tenant_id() t`);
      assert.equal(row.t, null);
      assert.equal(seen.length, 0);
    } finally {
      await db.exec("rollback");
    }
  });

  test("a suspended dealership loses access", async () => {
    await requireTenancy();
    await db.exec("begin");
    try {
      await db.query(`update public.tenants set status = 'suspended' where id = $1`, [B.tenant]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B.user]);
      await db.exec("set local role authenticated");
      assert.equal((await rows(db, `select id from public.vehicles`)).length, 0);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("tenant rows", () => {
  for (const [table, config] of Object.entries(TENANT_TABLES)) {
    if (!SERVICE_ONLY_TABLES.includes(table)) {
      test(`${table}: the owning dealership can still read its row (control)`, async () => {
        const found = await asUser(db, A.user, () =>
          rows(db, `select 1 from public.${table} where ${config.key} = $1`, [rowKey(table)]),
        );
        assert.equal(found.length, 1);
      });
    }

    test(`${table}: another dealership cannot read it`, async () => {
      const found = await asUser(db, B.user, async () => {
        const outcome = await attempt(db, () =>
          rows(db, `select 1 from public.${table} where ${targetsRow(table)}`, [rowKey(table)]),
        );
        return outcome.ok ? outcome.value : [];
      });
      assert.equal(found.length, 0);
    });

    test(`${table}: another dealership cannot update it`, async () => {
      const changed = await asUser(db, B.user, async () => {
        const outcome = await attempt(db, () =>
          rows(
            db,
            `update public.${table} set ${config.key} = ${config.key} where ${targetsRow(table)} returning 1`,
            [rowKey(table)],
          ),
        );
        return outcome.ok ? outcome.value.length : 0;
      });
      assert.equal(changed, 0);
    });

    test(`${table}: another dealership cannot delete it`, async () => {
      const removed = await asUser(db, B.user, async () => {
        const outcome = await attempt(db, () =>
          rows(db, `delete from public.${table} where ${targetsRow(table)} returning 1`, [
            rowKey(table),
          ]),
        );
        return outcome.ok ? outcome.value.length : 0;
      });
      assert.equal(removed, 0);
    });
  }

  const forgedInserts: Record<string, Record<string, unknown>> = {
    branches: { name: "x", code: "FORGE", emirate: "dubai", address_line_1: "a", city: "c" },
    customers: {
      customer_code: "FORGE",
      first_name: "x",
      last_name: "x",
      display_name: "x",
      phone: "+971500009999",
    },
    suppliers: { name: "forged" },
    notifications: { user_id: B.user, type: "t", title: "t", message: "m" },
  };
  for (const [table, values] of Object.entries(forgedInserts)) {
    test(`${table}: a row claiming another dealership's tenant_id is rejected`, async () => {
      await requireTenancy();
      const row = { ...values, tenant_id: A.tenant };
      const columns = Object.keys(row);
      const outcome = await asUser(db, B.user, () =>
        attempt(db, () =>
          rows(
            db,
            `insert into public.${table} (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
            Object.values(row),
          ),
        ),
      );
      assert.equal(outcome.ok, false);
    });
  }

  test("a row without a tenant_id lands in the caller's dealership", async () => {
    await requireTenancy();
    const [row] = await asUser(db, B.user, () =>
      rows<{ tenant_id: string }>(
        db,
        `insert into public.suppliers (name) values ('mine') returning tenant_id`,
      ),
    );
    assert.equal(row.tenant_id, B.tenant);
  });

  test("a dealership cannot move its own row to another dealership", async () => {
    await requireTenancy();
    const outcome = await asUser(db, A.user, () =>
      attempt(db, () =>
        rows(db, `update public.customers set tenant_id = $1 where id = $2 returning 1`, [
          B.tenant,
          id("a", "customer"),
        ]),
      ),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("a row cannot link to another dealership's records", async () => {
    await requireTenancy();
    await db.exec("begin");
    try {
      const cross = await attempt(db, () =>
        rows(db, `update public.vehicles set branch_id = $1 where id = $2`, [
          id("b", "branch"),
          id("a", "vehicle"),
        ]),
      );
      assert.equal(cross.ok, false, "vehicle linked to another dealership's branch");
      const booking = await attempt(db, () =>
        rows(db, `update public.reservations set customer_id = $1 where id = $2`, [
          id("b", "customer"),
          id("a", "reservation"),
        ]),
      );
      assert.equal(booking.ok, false, "booking linked to another dealership's customer");
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("unique values are per dealership", () => {
  const cases: [string, string, Parameters<typeof id>[1], string][] = [
    ["vehicles", "vin", "vehicle", "1HGCM82633A000001"],
    ["vehicles", "chassis_number", "vehicle", "CHS-a"],
    ["vehicles", "stock_number", "vehicle", "STK-a"],
    ["customers", "phone", "customer", "+971500000001"],
    ["customers", "customer_code", "customer", "CUS-a"],
    ["acquisitions", "acquisition_number", "acquisition", "ACQ-a"],
    ["reservations", "reservation_number", "reservation", "BK-a"],
    ["sales", "sale_number", "sale", "SL-a"],
    ["branches", "code", "branch", "BR-a"],
  ];
  for (const [table, column, entity, value] of cases) {
    test(`${table}.${column}: a second dealership can use the same value`, async () => {
      await db.exec("begin");
      try {
        const outcome = await attempt(db, () =>
          rows(db, `update public.${table} set ${column} = $1 where id = $2`, [
            value,
            id("b", entity),
          ]),
        );
        assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
      } finally {
        await db.exec("rollback");
      }
    });
  }

  test("profiles.employee_code: a second dealership can use the same value", async () => {
    await db.exec("begin");
    try {
      await db.query(`update public.profiles set employee_code = 'E1' where id = $1`, [A.user]);
      const outcome = await attempt(db, () =>
        rows(db, `update public.profiles set employee_code = 'E1' where id = $1`, [B.user]),
      );
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    } finally {
      await db.exec("rollback");
    }
  });

  test("the same dealership still cannot repeat a value (control)", async () => {
    await db.exec("begin");
    try {
      const scoped = await tenantColumnExists("customers");
      const outcome = await attempt(db, () =>
        rows(
          db,
          `insert into public.customers (${scoped ? "tenant_id, " : ""}customer_code, first_name, last_name, display_name, phone)
           values (${scoped ? `'${A.tenant}', ` : ""}'NEW', 'x', 'x', 'x', '+971500000001')`,
        ),
      );
      assert.equal(outcome.ok, false);
    } finally {
      await db.exec("rollback");
    }
  });

  test("record numbers use each dealership's prefix and its own counter", async () => {
    await requireTenancy();
    const [a] = await asUser(db, A.user, () =>
      rows<{ n: string }>(db, `select public.next_vehicle_stock_number() n`),
    );
    const [b] = await asUser(db, B.user, () =>
      rows<{ n: string }>(db, `select public.next_vehicle_stock_number() n`),
    );
    const [acq] = await asUser(db, B.user, () =>
      rows<{ n: string }>(db, `select public.next_acquisition_number() n`),
    );
    assert.match(a.n, /^ZM-\d{6,}$/);
    assert.equal(b.n, "SD-000001");
    assert.equal(acq.n, "SD-ACQ-000001");
  });
});

/** Read functions must raise, or return nothing useful, for another dealership's ID. */
const READ_ATTACKS: Record<string, string> = {
  can_access_branch: `select public.can_access_branch('${id("a", "branch")}')`,
  has_permission_for_branch: `select public.has_permission_for_branch('vehicle.view', '${id("a", "branch")}')`,
  has_permission_for_optional_branch: `select public.has_permission_for_optional_branch('vehicle.view', '${id("a", "branch")}')`,
  can_access_customer_storage: `select public.can_access_customer_storage('${id("a", "customer")}', false)`,
  can_access_sale_storage: `select public.can_access_sale_storage('${id("a", "sale")}', false)`,
  can_access_vehicle_document_storage: `select public.can_access_vehicle_document_storage('${id("a", "vehicle")}', false)`,
  can_access_vehicle_storage: `select public.can_access_vehicle_storage('${id("a", "vehicle")}', false)`,
  can_access_workshop_storage: `select public.can_access_workshop_storage('${id("a", "vehicle")}', false)`,
  acquisition_expense_sum: `select public.acquisition_expense_sum('${id("a", "acquisition")}')`,
  acquisition_total_cost: `select public.acquisition_total_cost('${id("a", "acquisition")}')`,
  vehicle_other_expense_cost: `select public.vehicle_other_expense_cost('${id("a", "vehicle")}')`,
  vehicle_root_id: `select public.vehicle_root_id('${id("a", "vehicle")}')`,
  vehicle_workshop_actual_cost: `select public.vehicle_workshop_actual_cost('${id("a", "vehicle")}')`,
  get_vehicle_cost_breakdown: `select public.get_vehicle_cost_breakdown('${id("a", "vehicle")}')`,
  get_vehicle_profitability: `select public.get_vehicle_profitability('${id("a", "vehicle")}', 9000)`,
  get_vehicle_total_cost: `select public.get_vehicle_total_cost('${id("a", "vehicle")}')`,
  read_acquisition_costs: `select public.read_acquisition_costs('${id("a", "acquisition")}')`,
  read_acquisitions_costs: `select * from public.read_acquisitions_costs(array['${id("a", "acquisition")}']::uuid[])`,
  read_vehicle_costs: `select public.read_vehicle_costs('${id("a", "vehicle")}')`,
  read_vehicle_profit: `select public.read_vehicle_profit('${id("a", "vehicle")}')`,
  evaluate_vehicle_ready_for_sale: `select public.evaluate_vehicle_ready_for_sale('${id("a", "vehicle")}')`,
};

const toStatus = (...statuses: string[]) =>
  statuses.map(
    (status) =>
      `update public.acquisitions set status = '${status}' where id = '${id("a", "acquisition")}'`,
  );
const PENDING_APPROVAL = toStatus("sourcing", "negotiating", "pending_approval");

/**
 * Write functions must raise or leave the target row untouched. `setup` puts tenant A's row
 * in a state where the call really works: each has an owner control proving that, so an
 * attack cannot pass merely because the record was in the wrong state.
 */
const WRITE_ATTACKS: Record<
  string,
  { call: string; table: string; entity: Parameters<typeof id>[1]; setup?: string[] }
> = {
  approve_acquisition: {
    call: `public.approve_acquisition('${id("a", "acquisition")}', 'x')`,
    table: "acquisitions",
    entity: "acquisition",
    setup: PENDING_APPROVAL,
  },
  reject_acquisition: {
    call: `public.reject_acquisition('${id("a", "acquisition")}', 'x')`,
    table: "acquisitions",
    entity: "acquisition",
    setup: PENDING_APPROVAL,
  },
  cancel_acquisition: {
    call: `public.cancel_acquisition('${id("a", "acquisition")}', 'x')`,
    table: "acquisitions",
    entity: "acquisition",
  },
  change_acquisition_status: {
    call: `public.change_acquisition_status('${id("a", "acquisition")}', 'sourcing', 'x')`,
    table: "acquisitions",
    entity: "acquisition",
  },
  confirm_acquisition_purchase: {
    call: `public.confirm_acquisition_purchase('${id("a", "acquisition")}', 'x')`,
    table: "acquisitions",
    entity: "acquisition",
    setup: [
      ...toStatus("sourcing", "negotiating", "pending_approval", "approved"),
      `set local session_replication_role = replica`,
      `update public.vehicles set status = 'acquired' where id = '${id("a", "vehicle")}'`,
      `set local session_replication_role = origin`,
    ],
  },
  receive_acquisition: {
    call: `public.receive_acquisition('${id("a", "acquisition")}', 'x')`,
    table: "acquisitions",
    entity: "acquisition",
    setup: toStatus("sourcing", "negotiating", "pending_approval", "approved", "purchased"),
  },
  approve_vehicle_pricing: {
    call: `public.approve_vehicle_pricing('${id("a", "vehicle")}', 'x', true)`,
    table: "vehicle_pricing",
    entity: "pricing",
    setup: [
      `update public.vehicle_pricing set pricing_status = 'pending_approval' where id = '${id("a", "pricing")}'`,
    ],
  },
  upsert_vehicle_pricing: {
    call: `public.upsert_vehicle_pricing('${id("a", "vehicle")}', p_minimum_selling_price => 1, p_target_selling_price => 2, p_advertised_price => 3, p_current_selling_price => 3)`,
    table: "vehicle_pricing",
    entity: "pricing",
  },
  archive_vehicle: {
    call: `public.archive_vehicle('${id("a", "vehicle")}', 'x')`,
    table: "vehicles",
    entity: "vehicle",
  },
  change_vehicle_status: {
    call: `public.change_vehicle_status('${id("a", "vehicle")}', 'reserved', 'x')`,
    table: "vehicles",
    entity: "vehicle",
  },
  mark_vehicle_ready_for_sale: {
    call: `public.mark_vehicle_ready_for_sale('${id("a", "vehicle")}', 'x', true, 'x')`,
    table: "vehicles",
    entity: "vehicle",
    setup: [
      `update public.vehicles set status = 'under_repair' where id = '${id("a", "vehicle")}'`,
    ],
  },
  transfer_vehicle: {
    call: `public.transfer_vehicle('${id("a", "vehicle")}', '${id("a", "branch")}', null, 'x')`,
    table: "vehicles",
    entity: "vehicle",
  },
  update_vehicle_costs: {
    call: `public.update_vehicle_costs('${id("a", "vehicle")}', 1, 1)`,
    table: "vehicles",
    entity: "vehicle",
  },
  set_vehicle_photo_primary: {
    call: `public.set_vehicle_photo_primary('${id("a", "photo")}')`,
    table: "vehicle_photos",
    entity: "photo",
  },
  assign_user_role: {
    call: `public.assign_user_role('${id("a", "plainUser")}', 'super_admin')`,
    table: "user_roles",
    entity: "staffRole",
  },
  revoke_user_role: {
    call: `public.revoke_user_role('${id("a", "staffRole")}')`,
    table: "user_roles",
    entity: "staffRole",
  },
};

const uselessResult = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  (typeof value !== "object" && value !== true && Number(value) === 0) ||
  (Array.isArray(value) && value.length === 0) ||
  // Functions that report refusal as data, such as { error: "branch_denied" }.
  (typeof value === "object" && "error" in value);

describe("definer functions cannot be pointed at another dealership", () => {
  for (const [name, sql] of Object.entries(READ_ATTACKS)) {
    // Both are retired: one reads a dropped table, the other always returns 0.
    if (name !== "can_access_workshop_storage" && name !== "vehicle_workshop_actual_cost") {
      test(`${name}: the owning dealership gets a real answer (control)`, async () => {
        const outcome = await asUser(db, A.user, () =>
          attempt(db, () => rows<Record<string, unknown>>(db, sql)),
        );
        assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
        const values = outcome.ok ? outcome.value.flatMap((row) => Object.values(row)) : [];
        assert.ok(!values.every(uselessResult), `Returned ${JSON.stringify(values)}`);
      });
    }

    test(`${name} reveals nothing`, async () => {
      const outcome = await asUser(db, B.user, () =>
        attempt(db, () => rows<Record<string, unknown>>(db, sql)),
      );
      if (!outcome.ok) return;
      const values = outcome.value.flatMap((row) => Object.values(row));
      assert.ok(values.every(uselessResult), `Returned ${JSON.stringify(values)}`);
    });
  }

  /** Tenant A's target row plus A's staff role assignments, so new assignments count too. */
  const snapshot = (table: string, entity: Parameters<typeof id>[1]) =>
    asSuperuser(db, async () =>
      JSON.stringify([
        await rows(db, `select to_jsonb(t) r from public.${table} t where id = $1`, [
          id("a", entity),
        ]),
        await rows(db, `select id from public.user_roles where user_id = $1 order by id`, [
          id("a", "plainUser"),
        ]),
      ]),
    );

  for (const [name, { call, table, entity, setup = [] }] of Object.entries(WRITE_ATTACKS)) {
    const run = (user: string) =>
      asUser(db, user, async () => {
        // Setup is not an attack: run it with no identity, so permission triggers stay out of it.
        await asSuperuser(db, async () => {
          await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
          for (const statement of setup) await db.exec(statement);
          await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
        });
        const before = await snapshot(table, entity);
        const outcome = await attempt(db, () => rows(db, `select ${call}`));
        return { outcome, changed: (await snapshot(table, entity)) !== before };
      });

    test(`${name}: the owning dealership can call it (control)`, async () => {
      const { outcome, changed } = await run(A.user);
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
      assert.equal(changed, true, "The call succeeded but changed nothing");
    });

    test(`${name}: another dealership changes nothing`, async () => {
      const { changed } = await run(B.user);
      assert.equal(changed, false);
    });
  }

  test("write_audit_log records under the caller's dealership only", async () => {
    await requireTenancy();
    await asUser(db, B.user, async () => {
      await rows(
        db,
        `select public.write_audit_log('probe', 'vehicles', $1, null, null, '{}'::jsonb)`,
        [id("a", "vehicle")],
      );
      const seen = await asSuperuser(db, () =>
        rows<{ tenant_id: string }>(
          db,
          `select tenant_id from public.audit_logs where action = 'probe'`,
        ),
      );
      assert.deepEqual(
        seen.map((r) => r.tenant_id),
        [B.tenant],
      );
    });
  });
});

describe("shared and privileged data", () => {
  test("a dealership admin cannot read another dealership's settings", async () => {
    const seen = await asUser(db, B.user, () =>
      rows<{ value: string }>(
        db,
        `select value #>> '{}' as value from public.system_settings where key = 'test.marker'`,
      ),
    );
    assert.ok(!seen.some((r) => r.value === "secret-a"), "Saw the other dealership's setting");
  });

  test("a dealership admin cannot change the shared catalog", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(
          db,
          `insert into public.vehicle_makes (name, slug) values ('Forged', 'forged') returning 1`,
        ),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("the shared catalog stays readable (control)", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () => rows(db, `select 1 from public.vehicle_makes limit 1`)),
    );
    assert.equal(outcome.ok, true);
  });

  test("a dealership admin cannot change shared roles or their permissions", async () => {
    const results = await asUser(db, B.user, async () => [
      await attempt(db, () =>
        rows(db, `insert into public.roles (key, name) values ('forged', 'x') returning 1`),
      ),
      await attempt(db, () => rows(db, `update public.roles set name = 'x' returning 1`)),
      await attempt(db, () => rows(db, `delete from public.role_permissions returning 1`)),
    ]);
    for (const outcome of results) assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("a dealership admin cannot give roles to another dealership's users", async () => {
    const [role] = await rows<{ id: string }>(
      db,
      `select id from public.roles where key = 'super_admin'`,
    );
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(db, `insert into public.user_roles (user_id, role_id) values ($1, $2) returning 1`, [
          id("a", "plainUser"),
          role.id,
        ]),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("a dealership admin can still manage their own users' roles (control)", async () => {
    const [role] = await rows<{ id: string }>(
      db,
      `select id from public.roles where key = 'super_admin'`,
    );
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(db, `insert into public.user_roles (user_id, role_id) values ($1, $2) returning 1`, [
          id("b", "plainUser"),
          role.id,
        ]),
      ),
    );
    assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  });

  test("notifications cannot be sent to another dealership's users", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(
          db,
          `insert into public.notifications (user_id, type, title, message) values ($1, 't', 't', 'm') returning 1`,
          [A.user],
        ),
      ),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("storage", () => {
  const path = `${id("a", "vehicle")}/gallery/p.jpg`;

  test("the owning dealership can read its file (control)", async () => {
    const seen = await asUser(db, A.user, () =>
      rows(db, `select 1 from storage.objects where name = $1`, [path]),
    );
    assert.equal(seen.length, 1);
  });

  test("another dealership cannot read it", async () => {
    const seen = await asUser(db, B.user, () =>
      rows(db, `select 1 from storage.objects where name = $1`, [path]),
    );
    assert.equal(seen.length, 0);
  });

  test("another dealership cannot upload into its folders", async () => {
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(db, `insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)`, [
          `${id("a", "vehicle")}/gallery/forged.jpg`,
        ]),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("another dealership cannot delete it", async () => {
    const removed = await asUser(db, B.user, () =>
      rows(db, `delete from storage.objects where name = $1 returning 1`, [path]),
    );
    assert.equal(removed.length, 0);
  });
});

describe("tenancy tables", () => {
  test("a dealership cannot see another dealership or its members", async () => {
    await requireTenancy();
    await asUser(db, B.user, async () => {
      assert.equal(
        (await rows(db, `select 1 from public.tenants where id = $1`, [A.tenant])).length,
        0,
      );
      assert.equal(
        (await rows(db, `select 1 from public.tenant_members where tenant_id = $1`, [A.tenant]))
          .length,
        0,
      );
      assert.equal(
        (await rows(db, `select 1 from public.tenants where id = $1`, [B.tenant])).length,
        1,
        "own tenant visible",
      );
    });
  });

  test("a user cannot add themselves to another dealership", async () => {
    await requireTenancy();
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(
          db,
          `insert into public.tenant_members (tenant_id, user_id, status) values ($1, $2, 'active')`,
          [A.tenant, B.user],
        ),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("a user cannot move their membership to another dealership", async () => {
    await requireTenancy();
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(db, `update public.tenant_members set tenant_id = $1 where user_id = $2 returning 1`, [
          A.tenant,
          B.user,
        ]),
      ),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("a dealership admin cannot change their status or number prefix", async () => {
    await requireTenancy();
    const outcome = await asUser(db, B.user, () =>
      attempt(db, () =>
        rows(
          db,
          `update public.tenants set status = 'active', number_prefix = 'ZM' where id = $1 returning 1`,
          [B.tenant],
        ),
      ),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });
});

describe("platform administrators are separate", () => {
  const platformUser = "cccccccc-0000-4000-8000-000000000001";

  test("a dealership admin cannot become or see platform admins", async () => {
    assert.ok(await exists(db, "public.platform_admins"), "platform_admins does not exist");
    const outcome = await asUser(db, B.user, async () => [
      await attempt(db, () =>
        rows(db, `insert into public.platform_admins (user_id) values ($1) returning 1`, [B.user]),
      ),
      await attempt(db, () => rows(db, `select 1 from public.platform_admins`)),
    ]);
    assert.equal(outcome[0].ok, false);
    assert.equal(outcome[1].ok && outcome[1].value.length > 0, false);
  });

  test("a platform admin has no implicit access to dealership data", async () => {
    assert.ok(await exists(db, "public.platform_admins"), "platform_admins does not exist");
    await db.exec("begin");
    try {
      await db.query(`insert into auth.users (id, email) values ($1, 'platform@example.test')`, [
        platformUser,
      ]);
      await db.query(`update public.profiles set status = 'active' where id = $1`, [platformUser]);
      await db.query(`insert into public.platform_admins (user_id) values ($1)`, [platformUser]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [platformUser]);
      await db.exec("set local role authenticated");
      const [flag] = await rows<{ yes: boolean }>(db, `select public.is_platform_admin() yes`);
      assert.equal(flag.yes, true);
      for (const table of ["vehicles", "customers", "reservations", "sales", "documents"]) {
        assert.equal((await rows(db, `select 1 from public.${table}`)).length, 0, table);
      }
      const write = await attempt(db, () =>
        rows(
          db,
          `insert into public.vehicle_makes (name, slug) values ('Platform', 'platform') returning 1`,
        ),
      );
      assert.equal(write.ok, true, write.ok ? "" : write.error);
    } finally {
      await db.exec("rollback");
    }
  });

  test("a dealership admin is not a platform admin", async () => {
    assert.ok(await exists(db, "public.is_platform_admin"), "is_platform_admin() does not exist");
    const [row] = await asUser(db, A.user, () =>
      rows<{ yes: boolean }>(db, `select public.is_platform_admin() yes`),
    );
    assert.equal(row.yes, false);
  });
});

describe("background jobs stay inside each dealership", () => {
  test("deposit deadlines use each dealership's own setting and alert only its admins", async () => {
    assert.ok(await tenantColumnExists("system_settings"), "system_settings has no tenant_id");
    await db.exec("begin");
    try {
      await db.exec(`update public.reservations set reserved_at = now() - interval '2 days'`);
      await db.query(
        `insert into public.system_settings (tenant_id, key, value) values ($1, 'booking.deposit_minutes', '60'), ($2, 'booking.deposit_minutes', '525600')
         on conflict (tenant_id, key) do update set value = excluded.value`,
        [A.tenant, B.tenant],
      );
      await db.exec(`select public.cancel_unpaid_bookings()`);
      const statuses = await rows<{ id: string; status: string }>(
        db,
        `select id, status from public.reservations`,
      );
      const statusOf = (rowId: string) => statuses.find((r) => r.id === rowId)?.status;
      assert.equal(statusOf(id("a", "reservation")), "cancelled");
      assert.equal(statusOf(id("b", "reservation")), "active");
      const alerts = await rows<{ user_id: string; tenant_id: string }>(
        db,
        `select user_id, tenant_id from public.notifications where type = 'booking_auto_cancelled'`,
      );
      assert.deepEqual(alerts, [{ user_id: A.user, tenant_id: A.tenant }]);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("background jobs: recipients", () => {
  test("an expired booking alerts only its own dealership's admins", async () => {
    await requireTenancy();
    await db.exec("begin");
    try {
      await db.exec(`update public.reservations set reserved_at = now() - interval '30 days'`);
      await db.exec(`select public.cancel_unpaid_bookings()`);
      const alerts = await rows<{ user_id: string; entity_id: string; tenant_id: string }>(
        db,
        `select user_id, entity_id, tenant_id from public.notifications
         where type = 'booking_auto_cancelled' order by user_id`,
      );
      assert.deepEqual(alerts, [
        { user_id: A.user, entity_id: id("a", "reservation"), tenant_id: A.tenant },
        { user_id: B.user, entity_id: id("b", "reservation"), tenant_id: B.tenant },
      ]);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("migrating existing Zohaan Motors data", () => {
  let legacy: PGlite;

  after(async () => {
    await legacy?.close();
  });

  test("every row moves to Zohaan Motors unchanged, with no triggers fired", async () => {
    legacy = await createDatabase(LAST_SINGLE_TENANT_MIGRATION);
    await seedTenant(legacy, "a");
    await legacy.exec(
      `select nextval('public.vehicle_stock_number_seq') from generate_series(1, 41)`,
    );

    const tables = Object.keys(TENANT_TABLES);
    const snapshot = async () => {
      const result: Record<string, unknown[]> = {};
      for (const table of tables) {
        const key = TENANT_TABLES[table].key;
        result[table] = (
          await rows<{ r: Record<string, unknown> }>(
            legacy,
            `select to_jsonb(t) - 'tenant_id' r from public.${table} t order by ${key}`,
          )
        ).map((row) => row.r);
      }
      return result;
    };
    const before = await snapshot();

    // Later phases add columns of their own, which have their own migration tests.
    await applyMigrations(legacy, "00070", "00076");

    for (const table of tables) {
      const [row] = await rows<{ n: number }>(
        legacy,
        `select count(*)::int n from public.${table} where tenant_id is distinct from $1`,
        [ZOHAAN_TENANT_ID],
      );
      assert.equal(row.n, 0, `${table} has rows outside Zohaan Motors`);
    }
    assert.deepEqual(await snapshot(), before, "Existing rows changed");

    const [tenant] = await rows<{ name: string; number_prefix: string }>(
      legacy,
      `select name, number_prefix from public.tenants where id = $1`,
      [ZOHAAN_TENANT_ID],
    );
    assert.deepEqual(tenant, { name: "Zohaan Motors", number_prefix: "ZM" });

    const [unmatched] = await rows<{ n: number }>(
      legacy,
      `select count(*)::int n from public.profiles p
       where not exists (select 1 from public.tenant_members m where m.user_id = p.id)`,
    );
    assert.equal(unmatched.n, 0, "Profiles without a membership");

    await legacy.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      id("a", "profile"),
    ]);
    const [next] = await rows<{ n: string }>(legacy, `select public.next_vehicle_stock_number() n`);
    assert.equal(next.n, "ZM-000042", "Stock numbers must continue from the old sequence");
  });
});
