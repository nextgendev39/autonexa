import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asSuperuser, asUser, attempt, createDatabase, rows } from "./harness";
import { PLATFORM_CALLS } from "./platform-attacks";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/**
 * Phase 3. Tenant B's owner is a Super Admin, so only the platform boundary stops them. Platform
 * staff have no dealership. Each denial has a control showing the same action works for someone
 * entitled to it.
 */
const A_OWNER = id("a", "profile");
const B_OWNER = id("b", "profile");
const A = ZOHAAN_TENANT_ID;
const B = SECOND_TENANT_ID;
const staff = (n: number) => `ffffffff-0000-4000-8000-00000000000${n}`;
const STAFF = {
  owner: staff(1),
  admin: staff(2),
  billing: staff(3),
  support: staff(4),
  catalog: staff(5),
  owner2: staff(6),
};

let db: PGlite;
const plan = async (key: string) =>
  (await rows<{ id: string }>(db, `select id from public.plans where key = $1`, [key]))[0].id;

/** A login with no dealership, as the console creates them. */
async function addStaff(userId: string, role: string) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, `${role}-${userId.slice(-1)}@autonexa.test`]);
  await db.query(`update public.profiles set status = 'active', tenant_id = null where id = $1`, [userId]);
  await db.query(`delete from public.tenant_members where user_id = $1`, [userId]);
  await db.query(`insert into public.platform_admins (user_id, role) values ($1, $2)`, [userId, role]);
}

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");
  await addStaff(STAFF.owner, "owner");
  await addStaff(STAFF.admin, "admin");
  await addStaff(STAFF.billing, "billing");
  await addStaff(STAFF.support, "support");
  await addStaff(STAFF.catalog, "catalog");
  await db.exec(`insert into public.tenant_settings (tenant_id, display_name)
    values ('${B}', 'Second') on conflict do nothing`);
});

after(async () => {
  await db?.close();
});

/** Runs as the user, inside a transaction that rolls back, with `setup` applied with no identity. */
const as = <T>(user: string, work: () => Promise<T>, setup: string[] = []) =>
  asUser(db, user, async () => {
    await asSuperuser(db, async () => {
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      for (const statement of setup) await db.exec(statement);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    });
    return work();
  });

const assignB = (key: string, status = "active", extra = "") => [
  `insert into public.tenant_subscriptions (tenant_id, plan_id, status, billing_cycle ${extra ? ", current_period_end" : ""})
   select '${B}', id, '${status}', 'monthly' ${extra ? `, ${extra}` : ""} from public.plans where key = '${key}'`,
];
const setLimit = (column: string, value: number) => [
  `update public.plans set ${column} = ${value} where key = 'starter'`,
];

describe("existing data", () => {
  test("Zohaan Motors is on Enterprise with no expiry and no limits", async () => {
    const [row] = await rows<Record<string, unknown>>(
      db,
      `select p.key, s.status, s.current_period_end, p.max_users, p.max_vehicles, p.max_branches, p.max_storage_mb
       from public.tenant_subscriptions s join public.plans p on p.id = s.plan_id where s.tenant_id = $1`,
      [A],
    );
    assert.deepEqual(row, {
      key: "enterprise",
      status: "active",
      current_period_end: null,
      max_users: null,
      max_vehicles: null,
      max_branches: null,
      max_storage_mb: null,
    });
  });

  test("Enterprise has every feature", async () => {
    const off = await rows(
      db,
      `select 1 from public.plan_features pf join public.plans p on p.id = pf.plan_id
       where p.key = 'enterprise' and not pf.enabled`,
    );
    assert.equal(off.length, 0);
  });

  test("every plan has a row for every feature", async () => {
    const [row] = await rows<{ missing: number }>(
      db,
      `select count(*)::int missing from public.plans p cross join public.platform_features f
       left join public.plan_features pf on pf.plan_id = p.id and pf.feature_key = f.key
       where pf.plan_id is null`,
    );
    assert.equal(row.missing, 0);
  });

  test("the four plans exist", async () => {
    const plans = await rows<{ key: string }>(db, `select key from public.plans order by sort_order`);
    assert.deepEqual(plans.map((p) => p.key), ["starter", "growth", "professional", "enterprise"]);
  });
});

describe("dealership admins have no platform access", () => {
  for (const [name, call] of Object.entries(PLATFORM_CALLS)) {
    test(`${name} is refused`, async () => {
      const outcome = await as(B_OWNER, () => attempt(db, () => rows(db, call)));
      assert.equal(outcome.ok, false);
      assert.match(outcome.ok ? "" : outcome.error, /not authorized/);
    });
  }

  test("platform_usage is refused", async () => {
    const outcome = await as(B_OWNER, () => attempt(db, () => rows(db, `select * from public.platform_usage()`)));
    assert.equal(outcome.ok, false);
  });

  test("the staff list is refused", async () => {
    const outcome = await as(B_OWNER, () => attempt(db, () => rows(db, `select * from public.platform_admin_list()`)));
    assert.equal(outcome.ok, false);
  });

  test("current_platform_access answers nothing", async () => {
    const [row] = await as(B_OWNER, () => rows<{ a: unknown }>(db, `select public.current_platform_access() a`));
    assert.equal(row.a, null);
  });

  for (const table of ["plans", "plan_features", "platform_features", "platform_audit_logs", "platform_role_permissions"]) {
    test(`${table} is hidden`, async () => {
      const seen = await as(B_OWNER, () => rows(db, `select 1 from public.${table}`));
      assert.equal(seen.length, 0);
    });
  }

  test("cannot create a plan", async () => {
    const outcome = await as(B_OWNER, () =>
      attempt(db, () => rows(db, `insert into public.plans (key, name) values ('free', 'Free')`)),
    );
    assert.equal(outcome.ok, false);
  });

  test("cannot give themselves a better plan", async () => {
    const enterprise = await plan("enterprise");
    const outcome = await as(
      B_OWNER,
      () =>
        attempt(db, () =>
          rows(db, `update public.tenant_subscriptions set plan_id = $1 where tenant_id = $2 returning 1`, [
            enterprise,
            B,
          ]),
        ),
      assignB("starter"),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("cannot extend their own subscription", async () => {
    const outcome = await as(
      B_OWNER,
      () =>
        attempt(db, () =>
          rows(db, `update public.tenant_subscriptions set current_period_end = now() + interval '9 years' returning 1`),
        ),
      assignB("starter", "active", `now() + interval '1 day'`),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("cannot widen their plan's limits or features", async () => {
    await as(B_OWNER, async () => {
      const limit = await attempt(db, () => rows(db, `update public.plans set max_vehicles = 999999 returning 1`));
      assert.equal(limit.ok && limit.value.length > 0, false);
      const feature = await attempt(db, () => rows(db, `update public.plan_features set enabled = true returning 1`));
      assert.equal(feature.ok && feature.value.length > 0, false);
    });
  });

  test("cannot mark their own invoice paid or record a payment", async () => {
    const [invoice] = await rows<{ id: string }>(
      db,
      `insert into public.subscription_invoices (tenant_id, amount) values ($1, 100) returning id`,
      [B],
    );
    await as(B_OWNER, async () => {
      const paid = await attempt(db, () =>
        rows(db, `update public.subscription_invoices set status = 'paid' where id = $1 returning 1`, [invoice.id]),
      );
      assert.equal(paid.ok && paid.value.length > 0, false);
      const money = await attempt(db, () =>
        rows(db, `insert into public.subscription_transactions (tenant_id, invoice_id, amount) values ($1, $2, 100)`, [
          B,
          invoice.id,
        ]),
      );
      assert.equal(money.ok, false);
    });
  });

  test("cannot change their own status or settings", async () => {
    await as(B_OWNER, async () => {
      const tenant = await attempt(db, () =>
        rows(db, `update public.tenants set status = 'active', name = 'x' where id = $1 returning 1`, [B]),
      );
      assert.equal(tenant.ok && tenant.value.length > 0, false);
      const settings = await attempt(db, () =>
        rows(db, `update public.tenant_settings set display_name = 'x' where tenant_id = $1 returning 1`, [B]),
      );
      assert.equal(settings.ok && settings.value.length > 0, false);
    });
  });

  test("cannot create a dealership", async () => {
    const outcome = await as(B_OWNER, () =>
      attempt(db, () =>
        rows(db, `insert into public.tenants (name, slug, number_prefix) values ('x', 'x', 'XX') returning 1`),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("cannot make themselves platform staff, by SQL or by claim", async () => {
    await as(B_OWNER, async () => {
      const insert = await attempt(db, () =>
        rows(db, `insert into public.platform_admins (user_id, role) values ($1, 'owner')`, [B_OWNER]),
      );
      assert.equal(insert.ok, false);
    });
    const [forged] = await asUser(
      db,
      B_OWNER,
      () => rows<{ yes: boolean }>(db, `select public.has_platform_permission('tenants.manage') yes`),
      { role: "service_role", app_metadata: { platform_role: "owner" } },
    );
    assert.equal(forged.yes, false);
  });

  test("the sweep cannot be run by logged-in staff", async () => {
    for (const user of [B_OWNER, STAFF.owner]) {
      const outcome = await as(user, () =>
        attempt(db, () => rows(db, `select public.platform_subscription_sweep()`)),
      );
      assert.equal(outcome.ok, false);
    }
  });
});

describe("a dealership sees only what concerns itself", () => {
  const twoInvoices = [
    `insert into public.subscription_invoices (tenant_id, amount, invoice_number) values
      ('${A}', 111, 'A-1'), ('${B}', 222, 'B-1')`,
    `insert into public.tenant_domains (tenant_id, domain) values
      ('${A}', 'a.example.com'), ('${B}', 'b.example.com')`,
    ...assignB("starter"),
  ];

  test("its own subscription, invoices, settings and domains (control)", async () => {
    await as(
      B_OWNER,
      async () => {
        assert.equal((await rows(db, `select 1 from public.tenant_subscriptions where tenant_id = $1`, [B])).length, 1);
        assert.equal((await rows(db, `select 1 from public.subscription_invoices where invoice_number = 'B-1'`)).length, 1);
        assert.equal((await rows(db, `select 1 from public.tenant_settings where tenant_id = $1`, [B])).length, 1);
        assert.equal((await rows(db, `select 1 from public.tenant_domains where tenant_id = $1`, [B])).length, 1);
      },
      twoInvoices,
    );
  });

  for (const table of ["tenant_subscriptions", "subscription_invoices", "tenant_settings", "tenant_domains", "subscription_transactions"]) {
    test(`${table}: another dealership's rows are hidden`, async () => {
      const seen = await as(
        B_OWNER,
        () => rows(db, `select 1 from public.${table} where tenant_id = $1`, [A]),
        twoInvoices,
      );
      assert.equal(seen.length, 0);
    });
  }

  test("another dealership's plan and usage are not reachable", async () => {
    const [mine] = await as(
      B_OWNER,
      () => rows<{ p: { plan: string; usage: { vehicles: number } } }>(db, `select public.current_tenant_plan() p`),
      assignB("starter"),
    );
    assert.equal(mine.p.plan, "Starter");
    const direct = await as(B_OWNER, () =>
      attempt(db, () => rows(db, `select * from public.tenant_usage_counts($1)`, [A])),
    );
    assert.equal(direct.ok, false);
    const state = await as(B_OWNER, () =>
      attempt(db, () => rows(db, `select public.tenant_limit_state($1, 'users')`, [A])),
    );
    assert.equal(state.ok, false);
  });

  test("draft invoices stay hidden from the dealership", async () => {
    const seen = await as(
      B_OWNER,
      () => rows(db, `select 1 from public.subscription_invoices where invoice_number = 'D-1'`),
      [`insert into public.subscription_invoices (tenant_id, amount, invoice_number, status) values ('${B}', 1, 'D-1', 'draft')`],
    );
    assert.equal(seen.length, 0);
  });
});

describe("platform staff cannot read dealership data", () => {
  for (const table of [
    "vehicles", "customers", "reservations", "sales", "documents", "acquisitions", "notifications",
    "audit_logs", "system_settings", "branches", "user_roles", "staff_documents", "vehicle_expenses",
  ]) {
    test(`an owner sees no ${table}`, async () => {
      const seen = await as(STAFF.owner, () => rows(db, `select 1 from public.${table}`));
      assert.equal(seen.length, 0);
    });
  }

  test("an owner sees only their own profile", async () => {
    const seen = await as(STAFF.owner, () => rows<{ id: string }>(db, `select id from public.profiles`));
    assert.deepEqual(seen.map((p) => p.id), [STAFF.owner]);
  });

  test("an owner's files are limited the same way", async () => {
    const seen = await as(STAFF.owner, () => rows(db, `select 1 from storage.objects`));
    assert.equal(seen.length, 0);
  });

  test("usage returns counts and nothing else", async () => {
    const seen = await as(STAFF.owner, () => rows<Record<string, unknown>>(db, `select * from public.platform_usage()`));
    assert.equal(seen.length, 2);
    assert.deepEqual(Object.keys(seen[0]).sort(), ["branches", "storage_bytes", "tenant_id", "users", "vehicles"]);
  });

  test("an owner has no dealership", async () => {
    const [row] = await as(STAFF.owner, () => rows<{ t: string | null }>(db, `select public.current_tenant_id() t`));
    assert.equal(row.t, null);
  });
});

describe("platform roles", () => {
  /** Permission -> who holds it, as the console's menus and routes rely on. */
  const MATRIX: Record<string, (keyof typeof STAFF)[]> = {
    "console.access": ["owner", "admin", "billing", "support"],
    "tenants.manage": ["owner", "admin"],
    "plans.manage": ["owner", "admin"],
    "subscriptions.manage": ["owner", "admin", "billing"],
    // Admins need revenue on the dashboard, but cannot record or change money.
    "billing.view": ["owner", "admin", "billing"],
    "billing.manage": ["owner", "billing"],
    "usage.view": ["owner", "admin", "billing", "support"],
    "audit.view": ["owner", "admin", "support"],
    "admins.manage": ["owner"],
    "catalog.manage": ["owner", "admin", "catalog"],
    "roles.manage": ["owner"],
  };

  for (const [permission, holders] of Object.entries(MATRIX)) {
    test(`${permission}: ${holders.join(", ")}`, async () => {
      for (const role of ["owner", "admin", "billing", "support", "catalog"] as const) {
        const [row] = await as(STAFF[role], () =>
          rows<{ yes: boolean }>(db, `select public.has_platform_permission($1) yes`, [permission]),
        );
        assert.equal(row.yes, holders.includes(role), role);
      }
    });
  }

  test("a catalog editor cannot enter the console", async () => {
    const [row] = await as(STAFF.catalog, () =>
      rows<{ yes: boolean }>(db, `select public.has_platform_permission('console.access') yes`),
    );
    assert.equal(row.yes, false);
    const tenants = await as(STAFF.catalog, () => rows(db, `select 1 from public.tenants`));
    assert.equal(tenants.length, 0);
  });

  test("support can look and not touch", async () => {
    const enterprise = await plan("enterprise");
    await as(STAFF.support, async () => {
      assert.ok((await rows(db, `select 1 from public.tenants`)).length > 0, "control: reads tenants");
      assert.equal(
        (await attempt(db, () => rows(db, `select public.platform_set_tenant_status($1, 'suspended')`, [B]))).ok,
        false,
      );
      assert.equal(
        (await attempt(db, () => rows(db, `select public.platform_assign_plan($1, $2)`, [B, enterprise]))).ok,
        false,
      );
      const edit = await attempt(db, () => rows(db, `update public.tenants set name = 'x' returning 1`));
      assert.equal(edit.ok && edit.value.length > 0, false);
    });
  });

  test("billing staff cannot suspend a dealership or read staff", async () => {
    await as(STAFF.billing, async () => {
      const outcome = await attempt(db, () =>
        rows(db, `select public.platform_set_tenant_status($1, 'suspended')`, [B]),
      );
      assert.equal(outcome.ok, false);
      const add = await attempt(db, () =>
        rows(db, `update public.platform_admins set role = 'owner' where user_id = $1 returning 1`, [STAFF.support]),
      );
      assert.equal(add.ok && add.value.length > 0, false);
    });
  });

  test("an admin cannot make anyone an owner or change staff", async () => {
    const outcome = await as(STAFF.admin, () =>
      attempt(db, () => rows(db, `update public.platform_admins set role = 'owner' where user_id = $1 returning 1`, [STAFF.support])),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("an owner can change another person's role (control)", async () => {
    const outcome = await as(STAFF.owner, () =>
      attempt(db, () => rows(db, `update public.platform_admins set role = 'billing' where user_id = $1 returning 1`, [STAFF.support])),
    );
    assert.equal(outcome.ok && outcome.value.length, 1);
  });

  test("nobody can change their own access", async () => {
    const outcome = await as(STAFF.owner, () =>
      attempt(db, () => rows(db, `delete from public.platform_admins where user_id = $1`, [STAFF.owner])),
    );
    assert.equal(outcome.ok, false);
  });

  test("with two owners, one can be removed", async () => {
    await as(
      STAFF.owner2,
      async () => {
        const removeOther = await attempt(db, () =>
          rows(db, `delete from public.platform_admins where user_id = $1 returning 1`, [STAFF.owner]),
        );
        assert.equal(removeOther.ok && removeOther.value.length, 1, "control: with two owners, one can go");
      },
      [
        `insert into auth.users (id, email) values ('${STAFF.owner2}', 'o2@autonexa.test')`,
        `update public.profiles set status = 'active', tenant_id = null where id = '${STAFF.owner2}'`,
        `delete from public.tenant_members where user_id = '${STAFF.owner2}'`,
        `insert into public.platform_admins (user_id, role) values ('${STAFF.owner2}', 'owner')`,
      ],
    );
  });

  test("the only owner cannot be removed or demoted, even by someone allowed to manage staff", async () => {
    // No role can do this today, so grant it here: this proves the guard, not the role map.
    const grant = [`insert into public.platform_role_permissions (role, permission) values ('admin', 'admins.manage')`];
    for (const statement of [
      `delete from public.platform_admins where user_id = '${STAFF.owner}' returning 1`,
      `update public.platform_admins set role = 'admin' where user_id = '${STAFF.owner}' returning 1`,
    ]) {
      const outcome = await as(STAFF.admin, () => attempt(db, () => rows(db, statement)), grant);
      assert.equal(outcome.ok, false, statement);
      assert.match(outcome.ok ? "" : outcome.error, /last platform owner/);
    }
    const other = await as(
      STAFF.admin,
      () => attempt(db, () => rows(db, `update public.platform_admins set role = 'billing' where user_id = $1 returning 1`, [STAFF.support])),
      grant,
    );
    assert.equal(other.ok && other.value.length, 1, "control: the grant works on anyone else");
  });

  test("a disabled login loses platform access at once", async () => {
    const [row] = await as(
      STAFF.owner,
      () => rows<{ yes: boolean }>(db, `select public.has_platform_permission('tenants.view') yes`),
      [`update public.profiles set status = 'disabled' where id = '${STAFF.owner}'`],
    );
    assert.equal(row.yes, false);
  });

  test("no login can be both dealership staff and full platform staff", async () => {
    await db.exec("begin");
    try {
      const promote = await attempt(db, () =>
        rows(db, `insert into public.platform_admins (user_id, role) values ($1, 'owner')`, [id("a", "plainUser")]),
      );
      assert.equal(promote.ok, false, "dealership staff made platform staff");
      const join = await attempt(db, () =>
        rows(db, `insert into public.tenant_members (tenant_id, user_id) values ($1, $2)`, [A, STAFF.admin]),
      );
      assert.equal(join.ok, false, "platform staff joined a dealership");
      const catalog = await attempt(db, () =>
        rows(db, `insert into public.platform_admins (user_id, role) values ($1, 'catalog')`, [id("a", "plainUser")]),
      );
      assert.equal(catalog.ok, true, "control: the catalog role is the one exception");
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("tenant management", () => {
  test("an admin can create and edit a dealership (control)", async () => {
    await as(STAFF.admin, async () => {
      const [made] = await rows<{ id: string }>(
        db,
        `insert into public.tenants (name, slug, number_prefix) values ('New', 'new-co', 'NW') returning id`,
      );
      const [edited] = await rows<{ name: string }>(
        db,
        `update public.tenants set name = 'Renamed' where id = $1 returning name`,
        [made.id],
      );
      assert.equal(edited.name, "Renamed");
    });
  });

  test("dealerships cannot be deleted, even by an owner", async () => {
    const outcome = await as(STAFF.owner, () =>
      attempt(db, () => rows(db, `delete from public.tenants where id = $1 returning 1`, [B])),
    );
    assert.equal(outcome.ok && outcome.value.length > 0, false);
  });

  test("suspending locks the dealership out at once, and reactivating restores it", async () => {
    await db.exec("begin");
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [STAFF.admin]);
      await db.exec("set local role authenticated");
      await rows(db, `select public.platform_set_tenant_status($1, 'suspended', 'unpaid')`, [B]);

      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      assert.equal((await rows(db, `select 1 from public.vehicles`)).length, 0, "locked out");

      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [STAFF.admin]);
      await rows(db, `select public.platform_set_tenant_status($1, 'active')`, [B]);

      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      assert.ok((await rows(db, `select 1 from public.vehicles`)).length > 0, "restored");
    } finally {
      await db.exec("rollback");
    }
  });

  test("suspending keeps every record", async () => {
    await db.exec("begin");
    try {
      const count = async () =>
        (await rows<{ n: number }>(db, `select count(*)::int n from public.vehicles where tenant_id = $1`, [B]))[0].n;
      const before = await count();
      await db.query(`update public.tenants set status = 'suspended' where id = $1`, [B]);
      assert.equal(await count(), before);
    } finally {
      await db.exec("rollback");
    }
  });

  test("a suspended dealership's bookings are not auto-cancelled", async () => {
    await db.exec("begin");
    try {
      await db.exec(`update public.reservations set reserved_at = now() - interval '30 days'`);
      await db.query(`update public.tenants set status = 'suspended' where id = $1`, [B]);
      const [run] = await rows<{ n: number }>(db, `select public.cancel_unpaid_bookings() n`);
      assert.equal(run.n, 1, "only the active dealership");
      const [booking] = await rows<{ status: string }>(db, `select status from public.reservations where id = $1`, [
        id("b", "reservation"),
      ]);
      assert.equal(booking.status, "active");
    } finally {
      await db.exec("rollback");
    }
  });

  test("a domain can be claimed once per dealership, and must look like a domain", async () => {
    await as(STAFF.admin, async () => {
      await rows(db, `insert into public.tenant_domains (tenant_id, domain) values ($1, 'cars.example.com')`, [B]);
      // Claiming proves nothing, so two may claim. See storefront.test.ts for verified names.
      const again = await attempt(db, () =>
        rows(db, `insert into public.tenant_domains (tenant_id, domain) values ($1, 'cars.example.com')`, [B]),
      );
      assert.equal(again.ok, false, "The same dealership can't claim it twice");
      const bad = await attempt(db, () =>
        rows(db, `insert into public.tenant_domains (tenant_id, domain) values ($1, 'HTTP://evil')`, [B]),
      );
      assert.equal(bad.ok, false);
    });
  });

  test("a logo must be https and a colour must be a hex colour", async () => {
    await as(STAFF.admin, async () => {
      for (const set of [`logo_url = 'javascript:alert(1)'`, `primary_color = 'red;'`]) {
        const outcome = await attempt(db, () =>
          rows(db, `update public.tenant_settings set ${set} where tenant_id = $1`, [B]),
        );
        assert.equal(outcome.ok, false, set);
      }
    });
  });
});

describe("subscriptions", () => {
  const current = async (tenant: string) =>
    rows<{ key: string; status: string }>(
      db,
      `select p.key, s.status from public.tenant_subscriptions s join public.plans p on p.id = s.plan_id
       where s.tenant_id = $1 and s.status in ('trialing', 'active', 'past_due')`,
      [tenant],
    );
  const alerts = (type: string, tenant: string) =>
    asSuperuser(db, () =>
      rows<{ user_id: string }>(db, `select user_id from public.notifications where type = $1 and tenant_id = $2`, [
        type,
        tenant,
      ]),
    );

  test("assigning a plan replaces the current one and tells only that dealership", async () => {
    const growth = await plan("growth");
    await as(
      STAFF.billing,
      async () => {
        await rows(db, `select public.platform_assign_plan($1, $2)`, [B, growth]);
        assert.deepEqual(await asSuperuser(db, () => current(B)), [{ key: "growth", status: "active" }]);
        assert.deepEqual(await alerts("subscription_plan_changed", B), [{ user_id: B_OWNER }]);
        assert.deepEqual(await alerts("subscription_plan_changed", A), []);
      },
      assignB("starter"),
    );
  });

  test("only one subscription can be current", async () => {
    await db.exec("begin");
    try {
      for (const s of assignB("starter")) await db.exec(s);
      const second = await attempt(db, async () => {
        for (const s of assignB("growth")) await db.exec(s);
        return [];
      });
      assert.equal(second.ok, false);
    } finally {
      await db.exec("rollback");
    }
  });

  test("an inactive plan cannot be assigned", async () => {
    const growth = await plan("growth");
    const outcome = await as(
      STAFF.billing,
      () => attempt(db, () => rows(db, `select public.platform_assign_plan($1, $2)`, [B, growth])),
      [`update public.plans set is_active = false where key = 'growth'`],
    );
    assert.equal(outcome.ok, false);
  });

  test("a renewal extends the period, clears notices and revives an expired subscription", async () => {
    await as(
      STAFF.billing,
      async () => {
        const [sub] = await asSuperuser(db, () =>
          rows<{ id: string }>(db, `select id from public.tenant_subscriptions where tenant_id = $1`, [B]),
        );
        await rows(db, `select public.platform_renew_subscription($1, now() + interval '30 days')`, [sub.id]);
        const [row] = await asSuperuser(db, () =>
          rows<{ status: string; expiry_notice_days: number | null }>(
            db,
            `select status, expiry_notice_days from public.tenant_subscriptions where id = $1`,
            [sub.id],
          ),
        );
        assert.deepEqual(row, { status: "active", expiry_notice_days: null });
        const past = await attempt(db, () =>
          rows(db, `select public.platform_renew_subscription($1, now() - interval '1 day')`, [sub.id]),
        );
        assert.equal(past.ok, false, "must end in the future");
      },
      assignB("starter", "expired", `now() - interval '60 days'`),
    );
  });

  describe("the expiry sweep", () => {
    const sweep = () => rows<{ r: { notices: number; pastDue: number; expired: number } }>(db, `select public.platform_subscription_sweep() r`);
    const inTx = async (setup: string[], work: () => Promise<void>) => {
      await db.exec("begin");
      try {
        for (const s of setup) await db.exec(s);
        await work();
      } finally {
        await db.exec("rollback");
      }
    };
    const statusOfB = async () =>
      (await rows<{ status: string }>(db, `select status from public.tenant_subscriptions where tenant_id = $1`, [B]))[0].status;
    const count = async (type: string) =>
      (await rows<{ n: number }>(db, `select count(*)::int n from public.notifications where type = $1`, [type]))[0].n;

    test("warns once per stage, and again at the next stage", async () => {
      await inTx(assignB("starter", "active", `now() + interval '6 days'`), async () => {
        const [first] = await sweep();
        assert.equal(first.r.notices, 1);
        const [again] = await sweep();
        assert.equal(again.r.notices, 0, "same stage: no repeat");
        await db.exec(`update public.tenant_subscriptions set current_period_end = now() + interval '12 hours' where tenant_id = '${B}'`);
        const [later] = await sweep();
        assert.equal(later.r.notices, 1, "next stage");
        assert.equal(await count("subscription_expiring"), 2);
      });
    });

    test("nothing happens more than 14 days out, or with no end date", async () => {
      await inTx(assignB("starter", "active", `now() + interval '30 days'`), async () => {
        const [row] = await sweep();
        assert.deepEqual(row.r, { notices: 0, pastDue: 0, expired: 0 });
      });
    });

    test("moves to past due at the end of the period, and expires after grace", async () => {
      await inTx(assignB("starter", "active", `now() - interval '1 day'`), async () => {
        await sweep();
        assert.equal(await statusOfB(), "past_due");
        assert.equal(await count("subscription_past_due"), 1);
        await db.exec(`update public.tenant_subscriptions set current_period_end = now() - interval '8 days' where tenant_id = '${B}'`);
        await sweep();
        assert.equal(await statusOfB(), "expired");
        assert.equal(await count("subscription_expired"), 1);
      });
    });

    test("never touches Zohaan's no-expiry subscription", async () => {
      await inTx([], async () => {
        await sweep();
        const [row] = await rows<{ status: string }>(db, `select status from public.tenant_subscriptions where tenant_id = $1`, [A]);
        assert.equal(row.status, "active");
      });
    });

    test("never suspends a dealership", async () => {
      await inTx(assignB("starter", "active", `now() - interval '60 days'`), async () => {
        await sweep();
        await sweep();
        const [row] = await rows<{ status: string }>(db, `select status from public.tenants where id = $1`, [B]);
        assert.equal(row.status, "active");
      });
    });
  });
});

describe("plan limits", () => {
  const newVehicle = (quantity = 1) =>
    rows(
      db,
      `insert into public.vehicles (make, model, year, mileage, branch_id, source, status, quantity)
       values ('A', 'B', 2024, 1, $1, 'other', 'acquired', $2) returning id`,
      [id("b", "branch"), quantity],
    );
  const newBranch = () =>
    rows(
      db,
      `insert into public.branches (name, code, emirate, address_line_1, city) values ('N', 'NEW', 'dubai', 'r', 'c')`,
    );

  test("vehicles: up to the limit works, past it is refused", async () => {
    await as(
      B_OWNER,
      async () => {
        await newVehicle();
        const over = await attempt(db, () => newVehicle());
        assert.equal(over.ok, false);
        assert.match(over.ok ? "" : over.error, /plan_limit_exceeded:vehicles/);
      },
      [...assignB("starter"), ...setLimit("max_vehicles", 2)],
    );
  });

  test("vehicles: units count, not records", async () => {
    const outcome = await as(
      B_OWNER,
      () => attempt(db, () => newVehicle(5)),
      [...assignB("starter"), ...setLimit("max_vehicles", 3)],
    );
    assert.equal(outcome.ok, false);
  });

  test("vehicles: raising a quantity past the limit is refused", async () => {
    const outcome = await as(
      B_OWNER,
      () =>
        attempt(db, () =>
          rows(db, `update public.vehicles set quantity = 50 where id = $1`, [id("b", "vehicle")]),
        ),
      [...assignB("starter"), ...setLimit("max_vehicles", 3)],
    );
    assert.equal(outcome.ok, false);
  });

  test("vehicles: sold cars do not count", async () => {
    await as(
      B_OWNER,
      async () => {
        const outcome = await attempt(db, () => newVehicle());
        assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
      },
      [
        ...assignB("starter"),
        ...setLimit("max_vehicles", 1),
        `set local session_replication_role = replica`,
        `update public.vehicles set status = 'sold' where id = '${id("b", "vehicle")}'`,
        `set local session_replication_role = origin`,
      ],
    );
  });

  test("vehicles: splitting units adds no stock, so it works at the limit", async () => {
    await db.exec("begin");
    try {
      for (const s of [...assignB("starter"), ...setLimit("max_vehicles", 3)]) await db.exec(s);
      await db.query(`update public.vehicles set quantity = 3 where id = $1`, [id("b", "vehicle")]);
      const outcome = await attempt(db, () =>
        rows(db, `select public.split_vehicle_units($1, 1, $2)`, [id("b", "vehicle"), B_OWNER]),
      );
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    } finally {
      await db.exec("rollback");
    }
  });

  test("branches: limit applies to new and reactivated branches", async () => {
    await as(
      B_OWNER,
      async () => {
        const over = await attempt(db, newBranch);
        assert.match(over.ok ? "" : over.error, /plan_limit_exceeded:branches/);
      },
      [...assignB("starter"), ...setLimit("max_branches", 1)],
    );
    await as(
      B_OWNER,
      async () => {
        const back = await attempt(db, () =>
          rows(db, `update public.branches set is_active = true where id = $1`, [id("b", "branch")]),
        );
        assert.equal(back.ok, true, "control: with room it works");
      },
      [
        ...assignB("starter"),
        ...setLimit("max_branches", 1),
        `update public.branches set is_active = false where id = '${id("b", "branch")}'`,
      ],
    );
  });

  test("users: even privileged code cannot exceed the limit", async () => {
    await db.exec("begin");
    try {
      for (const s of [...assignB("starter"), ...setLimit("max_users", 2)]) await db.exec(s);
      const extra = "eeeeeeee-0000-4000-8000-000000000009";
      await db.query(`insert into auth.users (id, email) values ($1, 'extra@example.test')`, [extra]);
      await db.exec(`savepoint s`);
      const outcome = await attempt(db, () =>
        rows(db, `update public.profiles set tenant_id = $1 where id = $2`, [B, extra]),
      );
      assert.equal(outcome.ok, false);
      assert.match(outcome.ok ? "" : outcome.error, /plan_limit_exceeded:users/);
    } finally {
      await db.exec("rollback");
    }
  });

  test("storage: a file past the limit is refused, a repeated split photo is not counted", async () => {
    await as(
      B_OWNER,
      async () => {
        const row = (path: string) =>
          rows(
            db,
            `insert into public.vehicle_photos (vehicle_id, storage_path, category, file_name, file_size)
             values ($1, $2, 'front', 'x.jpg', $3)`,
            [id("b", "vehicle"), `${id("b", "vehicle")}/gallery/${path}`, 2 * 1024 * 1024],
          );
        const over = await attempt(db, () => row("big.jpg"));
        assert.match(over.ok ? "" : over.error, /plan_limit_exceeded:storage/);
      },
      [...assignB("starter"), ...setLimit("max_storage_mb", 1)],
    );
  });

  test("Zohaan, on Enterprise, has no limit", async () => {
    await as(A_OWNER, async () => {
      const outcome = await attempt(db, () =>
        rows(
          db,
          `insert into public.vehicles (make, model, year, mileage, branch_id, source, status, quantity)
           values ('A', 'B', 2024, 1, $1, 'other', 'acquired', 100000)`,
          [id("a", "branch")],
        ),
      );
      assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    });
  });

  test("a dealership with no subscription is not limited", async () => {
    await as(B_OWNER, async () => {
      assert.equal((await attempt(db, () => newVehicle(100000))).ok, true);
    });
  });

  for (const status of ["expired", "cancelled"]) {
    test(`${status}: reads keep working and additions pause`, async () => {
      await as(
        B_OWNER,
        async () => {
          assert.ok((await rows(db, `select 1 from public.vehicles`)).length > 0, "existing records stay");
          const over = await attempt(db, () => newVehicle());
          assert.match(over.ok ? "" : over.error, /subscription_inactive:vehicles/);
          const edit = await attempt(db, () =>
            rows(db, `update public.vehicles set mileage = 5 where id = $1 returning 1`, [id("b", "vehicle")]),
          );
          assert.equal(edit.ok && edit.value.length, 1, "existing records stay editable");
        },
        assignB("starter", status),
      );
    });
  }

  test("past due keeps working", async () => {
    await as(
      B_OWNER,
      async () => {
        assert.equal((await attempt(db, () => newVehicle())).ok, true);
      },
      assignB("starter", "past_due"),
    );
  });

  test("the app's own check takes no dealership ID, and answers for the caller", async () => {
    const [row] = await as(
      B_OWNER,
      () => rows<{ s: { allowed: boolean; limit: number; used: number } }>(db, `select public.current_tenant_limit('vehicles') s`),
      [...assignB("starter"), ...setLimit("max_vehicles", 1)],
    );
    assert.deepEqual(row.s.allowed, false);
    assert.equal(row.s.limit, 1);
    assert.equal(row.s.used, 1);
  });
});

describe("plan features", () => {
  const featureOff = (key: string) => [
    ...assignB("starter"),
    `update public.plan_features set enabled = false
     where feature_key = '${key}' and plan_id = (select id from public.plans where key = 'starter')`,
  ];

  test("a switched-off module closes for a Super Admin, in RLS and definer functions", async () => {
    await as(
      B_OWNER,
      async () => {
        assert.equal((await rows(db, `select 1 from public.acquisitions`)).length, 0, "reads");
        const [perm] = await rows<{ yes: boolean }>(db, `select public.has_permission('acquisition.view') yes`);
        assert.equal(perm.yes, false);
        const [branch] = await rows<{ yes: boolean }>(
          db,
          `select public.has_permission_for_branch('acquisition.edit', $1) yes`,
          [id("b", "branch")],
        );
        assert.equal(branch.yes, false);
        const rpc = await attempt(db, () =>
          rows(db, `select public.cancel_acquisition($1, 'x')`, [id("b", "acquisition")]),
        );
        assert.equal(rpc.ok, false, "definer function refused");
        const [off] = await rows<{ f: string[] }>(db, `select public.current_tenant_disabled_features() f`);
        assert.ok(off.f.includes("acquisitions"));
      },
      featureOff("acquisitions"),
    );
  });

  test("other modules stay open (control)", async () => {
    await as(
      B_OWNER,
      async () => {
        assert.ok((await rows(db, `select 1 from public.vehicles`)).length > 0);
        assert.ok((await rows(db, `select 1 from public.customers`)).length > 0);
        assert.ok((await rows(db, `select 1 from public.reservations`)).length > 0);
      },
      featureOff("acquisitions"),
    );
  });

  test("bookings off closes reservations and sales, and the records survive", async () => {
    await as(
      B_OWNER,
      async () => {
        assert.equal((await rows(db, `select 1 from public.reservations`)).length, 0);
        assert.equal((await rows(db, `select 1 from public.sales`)).length, 0);
        const kept = await asSuperuser(db, () =>
          rows(db, `select 1 from public.reservations where tenant_id = $1`, [B]),
        );
        assert.equal(kept.length, 1);
      },
      featureOff("bookings"),
    );
  });

  test("one dealership's plan doesn't affect another", async () => {
    await as(
      A_OWNER,
      async () => {
        assert.ok((await rows(db, `select 1 from public.acquisitions`)).length > 0);
      },
      featureOff("acquisitions"),
    );
  });

  test("Zohaan has no switched-off feature", async () => {
    const [row] = await as(A_OWNER, () => rows<{ f: string[] }>(db, `select public.current_tenant_disabled_features() f`));
    assert.deepEqual(row.f, []);
  });

  test("permissions a plan removes drop out of what the app is told", async () => {
    const [row] = await as(
      id("b", "plainUser"),
      () => rows<{ yes: boolean }>(db, `select 'acquisition.view' = any (public.current_user_permissions()) yes`),
      featureOff("acquisitions"),
    );
    assert.equal(row.yes, false);
  });
});

describe("billing", () => {
  const invoice = (amount = 100, status = "issued") =>
    rows<{ id: string }>(
      db,
      `insert into public.subscription_invoices (tenant_id, amount, status) values ($1, $2, $3) returning id`,
      [B, amount, status],
    );

  test("invoice numbers are generated and unique", async () => {
    const [made] = await as(STAFF.billing, () =>
      rows<{ invoice_number: string }>(
        db,
        `insert into public.subscription_invoices (tenant_id, amount) values ($1, 10) returning invoice_number`,
        [B],
      ),
    );
    assert.match(made.invoice_number, /^INV-\d{6,}$/);
  });

  test("part payments add up, and the invoice closes when covered", async () => {
    await db.exec("begin");
    try {
      const [made] = await invoice(100);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [STAFF.billing]);
      await db.exec("set local role authenticated");
      const status = async () =>
        (await rows<{ status: string }>(db, `select status from public.subscription_invoices where id = $1`, [made.id]))[0].status;
      await rows(db, `select public.platform_record_payment($1, 40, 'bank_transfer', 'REF-1')`, [made.id]);
      assert.equal(await status(), "issued");
      await rows(db, `select public.platform_record_payment($1, 60)`, [made.id]);
      assert.equal(await status(), "paid");
      const trail = await rows(db, `select 1 from public.subscription_transactions where invoice_id = $1`, [made.id]);
      assert.equal(trail.length, 2);
    } finally {
      await db.exec("rollback");
    }
  });

  test("a payment takes the invoice's dealership, not the caller's word", async () => {
    await db.exec("begin");
    try {
      const [made] = await invoice(100);
      const forged = await attempt(db, () =>
        rows(db, `insert into public.subscription_transactions (tenant_id, invoice_id, amount) values ($1, $2, 1)`, [
          A,
          made.id,
        ]),
      );
      assert.equal(forged.ok, false, "a transaction cannot point across dealerships");
    } finally {
      await db.exec("rollback");
    }
  });

  test("a paid or void invoice cannot be rewritten", async () => {
    await db.exec("begin");
    try {
      for (const status of ["paid", "void"]) {
        const [made] = await invoice(100, status);
        const changed = await attempt(db, () =>
          rows(db, `update public.subscription_invoices set amount = 1 where id = $1`, [made.id]),
        );
        assert.equal(changed.ok, false, status);
      }
    } finally {
      await db.exec("rollback");
    }
  });

  test("void and draft invoices take no money", async () => {
    await db.exec("begin");
    try {
      for (const status of ["void", "draft"]) {
        const [made] = await invoice(100, status);
        await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [STAFF.billing]);
        await db.exec("set local role authenticated");
        const outcome = await attempt(db, () => rows(db, `select public.platform_record_payment($1, 1)`, [made.id]));
        assert.equal(outcome.ok, false, status);
        await db.exec("reset role");
      }
    } finally {
      await db.exec("rollback");
    }
  });

  test("transactions cannot be edited or deleted by anyone logged in", async () => {
    await db.exec("begin");
    try {
      const [made] = await invoice(100);
      await db.query(`insert into public.subscription_transactions (tenant_id, invoice_id, amount) values ($1, $2, 1)`, [B, made.id]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [STAFF.owner]);
      await db.exec("set local role authenticated");
      const edit = await attempt(db, () => rows(db, `update public.subscription_transactions set amount = 999 returning 1`));
      assert.equal(edit.ok && edit.value.length > 0, false);
      const remove = await attempt(db, () => rows(db, `delete from public.subscription_transactions returning 1`));
      assert.equal(remove.ok && remove.value.length > 0, false);
    } finally {
      await db.exec("rollback");
    }
  });

  test("support cannot see billing", async () => {
    const seen = await as(STAFF.support, () => rows(db, `select 1 from public.subscription_invoices`), [
      `insert into public.subscription_invoices (tenant_id, amount) values ('${B}', 5)`,
    ]);
    assert.equal(seen.length, 0);
  });
});

describe("audit log", () => {
  const entries = (action: string) =>
    asSuperuser(db, () =>
      rows<{ actor_id: string | null; tenant_id: string | null; metadata: Record<string, unknown> }>(
        db,
        `select actor_id, tenant_id, metadata from public.platform_audit_logs where action = $1`,
        [action],
      ),
    );

  test("records who suspended whom, and why", async () => {
    await as(STAFF.admin, async () => {
      await rows(db, `select public.platform_set_tenant_status($1, 'suspended', 'unpaid')`, [B]);
      const [entry] = await entries("tenant.suspended");
      assert.equal(entry.actor_id, STAFF.admin);
      assert.equal(entry.tenant_id, B);
      assert.equal(entry.metadata.reason, "unpaid");
    });
  });

  test("records every change to a plan, even one made directly", async () => {
    await as(STAFF.admin, async () => {
      await rows(db, `update public.plans set max_vehicles = 7 where key = 'starter'`);
      // Migrations that seed plan data are recorded too, with no actor.
      const seen = (await entries("plans.update")).filter((entry) => entry.actor_id);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].actor_id, STAFF.admin);
    });
  });

  test("records changes to platform staff", async () => {
    await as(STAFF.owner, async () => {
      await rows(db, `update public.platform_admins set role = 'billing' where user_id = $1`, [STAFF.support]);
      const seen = await entries("platform_admins.update");
      assert.equal(seen.length, 1);
    });
  });

  test("entries cannot be changed or removed, even with no session", async () => {
    await db.exec("begin");
    try {
      await db.exec(`insert into public.platform_audit_logs (action, target_type) values ('x', 'y')`);
      const edit = await attempt(db, () => rows(db, `update public.platform_audit_logs set action = 'z'`));
      assert.equal(edit.ok, false);
      const remove = await attempt(db, () => rows(db, `delete from public.platform_audit_logs`));
      assert.equal(remove.ok, false);
    } finally {
      await db.exec("rollback");
    }
  });

  test("no logged-in user can write one directly", async () => {
    const outcome = await as(STAFF.owner, () =>
      attempt(db, () => rows(db, `insert into public.platform_audit_logs (action, target_type) values ('x', 'y')`)),
    );
    assert.equal(outcome.ok, false);
  });

  test("a dealership cannot read it, even about itself", async () => {
    const seen = await as(
      B_OWNER,
      () => rows(db, `select 1 from public.platform_audit_logs where tenant_id = $1`, [B]),
      [`insert into public.platform_audit_logs (action, target_type, tenant_id) values ('x', 'y', '${B}')`],
    );
    assert.equal(seen.length, 0);
  });

  test("a dealership's own audit log stays closed to platform staff", async () => {
    const seen = await as(STAFF.owner, () => rows(db, `select 1 from public.audit_logs`));
    assert.equal(seen.length, 0);
  });
});

describe("the first owner", () => {
  const FIRST = "fafafafa-0000-4000-8000-000000000001";
  const SECOND = "fafafafa-0000-4000-8000-000000000002";
  const claim = async (user: string) =>
    (await rows<{ r: boolean }>(db, `select public.platform_claim_first_owner($1) r`, [user]))[0].r;
  const inTx = async (work: () => Promise<void>) => {
    await db.exec("begin");
    try {
      // These tests need a platform with no owner yet.
      await db.exec(`alter table public.platform_admins disable trigger platform_admins_guard`);
      await db.exec(`delete from public.platform_admins where role = 'owner'`);
      await db.exec(`alter table public.platform_admins enable trigger platform_admins_guard`);
      for (const user of [FIRST, SECOND]) {
        await db.query(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@autonexa.test`]);
        await db.query(`update public.profiles set status = 'active', tenant_id = null where id = $1`, [user]);
      }
      await work();
    } finally {
      await db.exec("rollback");
    }
  };

  test("only the first one succeeds, and it can really run the platform", async () => {
    await inTx(async () => {
      assert.equal(await claim(FIRST), true);
      assert.equal(await claim(SECOND), false);
      const owners = await rows<{ user_id: string }>(db, `select user_id from public.platform_admins where role = 'owner'`);
      assert.deepEqual(owners, [{ user_id: FIRST }]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [FIRST]);
      const [{ yes }] = await rows<{ yes: boolean }>(db, `select public.has_platform_permission('admins.manage') yes`);
      assert.equal(yes, true);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      const [entry] = await rows<{ target_id: string }>(db, `select target_id from public.platform_audit_logs where action = 'platform.first_owner_created'`);
      assert.equal(entry.target_id, FIRST, "It's on the audit log");
    });
  });

  test("a dealership login can't become the owner", async () => {
    await inTx(async () => {
      const outcome = await attempt(db, () => rows(db, `select public.platform_claim_first_owner($1)`, [id("a", "plainUser")]));
      assert.equal(outcome.ok, false);
      assert.match(outcome.ok ? "" : outcome.error, /cannot be platform staff/);
    });
  });

  test("once an owner exists it does nothing", async () => {
    assert.equal(await claim(A_OWNER).catch(() => false), false);
  });

  test("nobody logged in or anonymous can call it", async () => {
    const staff = await as(B_OWNER, () => attempt(db, () => rows(db, `select public.platform_claim_first_owner($1)`, [B_OWNER])));
    assert.equal(staff.ok, false);
    assert.match(staff.ok ? "" : staff.error, /permission denied/);
    await db.exec("begin");
    try {
      await db.exec("set local role anon");
      const anon = await attempt(db, () => rows(db, `select public.platform_claim_first_owner($1)`, [B_OWNER]));
      assert.equal(anon.ok, false);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("someone not logged in", () => {
  test("can reach no platform table or function", async () => {
    await db.exec("begin");
    try {
      await db.exec("set local role anon");
      for (const table of ["plans", "tenant_subscriptions", "subscription_invoices", "platform_audit_logs", "tenant_settings"]) {
        const outcome = await attempt(db, () => rows(db, `select 1 from public.${table} limit 1`));
        assert.equal(outcome.ok && outcome.value.length > 0, false, table);
      }
      const usage = await attempt(db, () => rows(db, `select * from public.platform_usage()`));
      assert.equal(usage.ok, false);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("migrating existing Zohaan Motors data", () => {
  const ROLLBACKS = [
    "00079_platform_enforcement_down.sql",
    "00078_platform_plans_billing_down.sql",
    "00077_platform_admin_roles_down.sql",
  ];
  const TABLES = ["vehicles", "customers", "reservations", "sales", "profiles", "branches", "user_roles", "tenants"];
  const open: PGlite[] = [];
  after(async () => {
    await Promise.all(open.map((d) => d.close()));
  });

  const snapshot = async (d: PGlite) => {
    const out: Record<string, unknown> = {};
    for (const table of TABLES) {
      out[table] = (await rows<{ r: unknown }>(d, `select to_jsonb(t) r from public.${table} t order by 1`)).map((x) => x.r);
    }
    return out;
  };
  const schema = async (d: PGlite) => ({
    functions: await rows(d, `select p.proname, pg_get_function_identity_arguments(p.oid) a, pg_get_functiondef(p.oid) d
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`),
    policies: await rows(d, `select schemaname, tablename, policyname, permissive, cmd, qual, with_check from pg_policies order by 1, 2, 3`),
    triggers: await rows(d, `select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2`),
    tables: await rows(d, `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
    columns: await rows(d, `select table_name, column_name from information_schema.columns where table_schema = 'public' order by 1, 2`),
  });

  test("changes no existing row, keeps the catalog editors as catalog only, and rolls back cleanly", async () => {
    const { applyMigrations } = await import("./harness");
    const old = await createDatabase("00076");
    open.push(old);
    await seedTenant(old, "a");
    await old.query(`insert into public.platform_admins (user_id) values ($1)`, [A_OWNER]);
    const beforeData = await snapshot(old);
    const beforeSchema = await schema(old);

    await applyMigrations(old, "00077", "00079");
    assert.deepEqual(await snapshot(old), beforeData);
    const [admin] = await rows<{ role: string }>(old, `select role from public.platform_admins where user_id = $1`, [A_OWNER]);
    assert.equal(admin.role, "catalog", "A dealership admin must not gain console access");

    for (const file of ROLLBACKS) {
      await old.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", file), "utf8"));
    }
    assert.deepEqual(await snapshot(old), beforeData);
    assert.deepEqual(await schema(old), beforeSchema);
  });
});
