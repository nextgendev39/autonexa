import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations, asUser, attempt, createDatabase, rows } from "./harness";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/** 00085: what a listing says, repeat enquiries, popularity, and live sync with inventory. */
const A = ZOHAAN_TENANT_ID;
const B = SECOND_TENANT_ID;
const B_OWNER = id("b", "profile");
const V = id("b", "vehicle");

let db: PGlite;

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");
});

after(async () => {
  await db?.close();
});

const tx = async (work: () => Promise<void>) => {
  await db.exec("begin");
  try {
    await work();
  } finally {
    await db.exec("rollback");
  }
};

const details = (vehicle: string) =>
  rows<{ storefront_description: string | null; storefront_features: string[] }>(
    db,
    `select storefront_description, storefront_features from public.vehicles where id = $1`,
    [vehicle],
  ).then((r) => r[0]);

describe("what a listing says", () => {
  test("nothing is written for the public until someone writes it", async () => {
    const [row] = await rows<{ n: number }>(
      db,
      `select count(*)::int n from public.vehicles where storefront_description is not null or cardinality(storefront_features) > 0`,
    );
    assert.equal(row.n, 0);
  });

  test("a manager writes it, and what's sent is cleaned", async () => {
    await asUser(db, B_OWNER, async () => {
      await rows(db, `select public.storefront_set_vehicle_details($1, $2, $3)`, [
        V,
        "  One owner, full service history.  ",
        ["Sunroof", "  Sunroof ", "", "Leather seats", "   "],
      ]);
      const row = await details(V);
      assert.equal(row.storefront_description, "One owner, full service history.");
      assert.deepEqual(row.storefront_features, ["Sunroof", "Leather seats"]);
    });
  });

  test("blank text clears it", async () => {
    await asUser(db, B_OWNER, async () => {
      await rows(db, `select public.storefront_set_vehicle_details($1, 'x', array['y'])`, [V]);
      await rows(db, `select public.storefront_set_vehicle_details($1, '   ', null)`, [V]);
      const row = await details(V);
      assert.equal(row.storefront_description, null);
      assert.deepEqual(row.storefront_features, []);
    });
  });

  test("it is separate from the internal description", async () => {
    await tx(async () => {
      await db.query(
        `update public.vehicles set description = 'Paid too much, sell fast' where id = $1`,
        [V],
      );
      const row = await details(V);
      assert.equal(row.storefront_description, null);
    });
  });

  test("another dealership's car can't be written", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () =>
        rows(db, `select public.storefront_set_vehicle_details($1, 'x', null)`, [
          id("a", "vehicle"),
        ]),
      ),
    );
    assert.equal(outcome.ok, false);
    assert.equal((await details(id("a", "vehicle"))).storefront_description, null);
  });

  test("staff without the permission can't write it, through the function or the table", async () => {
    const plain = id("b", "plainUser");
    const viaFunction = await asUser(db, plain, () =>
      attempt(db, () =>
        rows(db, `select public.storefront_set_vehicle_details($1, 'x', null)`, [V]),
      ),
    );
    assert.equal(viaFunction.ok, false);
    const viaTable = await asUser(db, plain, () =>
      attempt(db, () =>
        rows(
          db,
          `update public.vehicles set storefront_features = array['x'] where id = $1 returning 1`,
          [V],
        ),
      ),
    );
    // Either the row is out of reach or the guard refuses: never a written feature.
    assert.ok(!viaTable.ok || viaTable.value.length === 0);
    assert.deepEqual((await details(V)).storefront_features, []);
  });

  test("more than 40 features is refused", async () => {
    const many = Array.from({ length: 41 }, (_, i) => `Feature ${i}`);
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () =>
        rows(db, `select public.storefront_set_vehicle_details($1, null, $2)`, [V, many]),
      ),
    );
    assert.equal(outcome.ok, false);
  });

  test("splitting units carries what the listing says", async () => {
    await tx(async () => {
      await db.query(
        `update public.vehicles set quantity = 3, storefront_published = true,
           storefront_description = 'Shared text', storefront_features = array['A'] where id = $1`,
        [V],
      );
      const [split] = await rows<{ id: string }>(
        db,
        `select public.split_vehicle_units($1, 1, $2) id`,
        [V, B_OWNER],
      );
      const row = await details(split.id);
      assert.equal(row.storefront_description, "Shared text");
      assert.deepEqual(row.storefront_features, ["A"]);
    });
  });
});

describe("the website reads the live inventory record", () => {
  test("a price change is what the next visitor sees, with no copy to update", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set current_selling_price = 81000 where id = $1`, [V]);
      const [first] = await rows<{ p: string }>(db, `select public.vehicle_public_price($1) p`, [
        V,
      ]);
      assert.equal(Number(first.p), 81000);
      await db.query(`update public.vehicles set current_selling_price = 79500 where id = $1`, [V]);
      const [second] = await rows<{ p: string }>(db, `select public.vehicle_public_price($1) p`, [
        V,
      ]);
      assert.equal(Number(second.p), 79500);
    });
  });

  test("unlisting a car stops enquiries about it at once", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set storefront_published = true where id = $1`, [V]);
      const submit = () =>
        rows(
          db,
          `select public.storefront_submit_enquiry($1, $2, 'enquiry', 'Sam', 'V', '+971507771000') id`,
          [B, V],
        );
      await db.exec("savepoint s");
      assert.equal((await submit()).length, 1, "control: listed cars take enquiries");
      await db.query(`update public.vehicles set storefront_published = false where id = $1`, [V]);
      await assert.rejects(submit(), /vehicle_not_available/);
      await db.exec("rollback to savepoint s");
    });
  });

  test("there is no second table of cars for the website", async () => {
    const tables = await rows<{ relname: string }>(
      db,
      `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
         and relname ~ '(storefront|listing|marketplace).*(vehicle|car)|(vehicle|car).*(storefront|listing|marketplace)'`,
    );
    assert.deepEqual(tables, []);
  });
});

describe("repeat enquiries", () => {
  const submit = (phone: string, vehicle: string | null, kind = "enquiry") =>
    rows<{ id: string }>(
      db,
      `select public.storefront_submit_enquiry($1, $2, $3, 'Sam', 'Visitor', $4, null, 'Hello') id`,
      [B, vehicle, kind, phone],
    ).then((r) => r[0].id);
  const count = async (phone: string) =>
    (
      await rows<{ n: number }>(
        db,
        `select count(*)::int n from public.storefront_enquiries where phone = $1`,
        [phone],
      )
    )[0].n;
  const notified = async () =>
    (
      await rows<{ n: number }>(
        db,
        `select count(*)::int n from public.notifications where type = 'storefront_enquiry'`,
      )
    )[0].n;

  test("the same question twice in a day is one enquiry and one alert", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set storefront_published = true where id = $1`, [V]);
      const alertsBefore = await notified();
      const first = await submit("+971507772001", V);
      const alertsAfterFirst = await notified();
      const second = await submit("+971507772001", V);
      assert.equal(second, first);
      assert.equal(await count("+971507772001"), 1);
      assert.equal(await notified(), alertsAfterFirst, "No second alert");
      assert.ok(alertsAfterFirst >= alertsBefore);
    });
  });

  test("a different car, or a general question, is a new enquiry", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set storefront_published = true where id = $1`, [V]);
      const aboutCar = await submit("+971507772002", V);
      const general = await submit("+971507772002", null);
      assert.notEqual(general, aboutCar);
      assert.equal(await count("+971507772002"), 2);
    });
  });

  test("once staff close it, asking again opens a new one", async () => {
    await tx(async () => {
      const first = await submit("+971507772003", null);
      await db.query(`update public.storefront_enquiries set status = 'closed' where id = $1`, [
        first,
      ]);
      const second = await submit("+971507772003", null);
      assert.notEqual(second, first);
    });
  });

  test("after a day it counts as new", async () => {
    await tx(async () => {
      const first = await submit("+971507772004", null);
      await db.query(
        `update public.storefront_enquiries set created_at = now() - interval '25 hours' where id = $1`,
        [first],
      );
      const second = await submit("+971507772004", null);
      assert.notEqual(second, first);
    });
  });

  test("the same number at another dealership is never merged", async () => {
    await tx(async () => {
      const atB = await submit("+971507772005", null);
      const [atA] = await rows<{ id: string }>(
        db,
        `select public.storefront_submit_enquiry($1, null, 'enquiry', 'Sam', 'V', '+971507772005') id`,
        [A],
      );
      assert.notEqual(atA.id, atB);
      const tenants = await rows<{ tenant_id: string }>(
        db,
        `select tenant_id from public.storefront_enquiries where phone = '+971507772005' order by tenant_id`,
      );
      assert.deepEqual(
        tenants.map((r) => r.tenant_id),
        [A, B].sort(),
      );
    });
  });
});

describe("popularity", () => {
  test("counts views per car for one dealership only", async () => {
    await tx(async () => {
      await db.query(
        `insert into public.storefront_events (tenant_id, kind, vehicle_id) values
           ($1, 'vehicle_view', $2), ($1, 'vehicle_view', $2), ($1, 'page_view', null),
           ($3, 'vehicle_view', $4)`,
        [B, V, A, id("a", "vehicle")],
      );
      const counts = await rows<{ vehicle_id: string; views: string }>(
        db,
        `select vehicle_id, views from public.storefront_vehicle_popularity($1, 30)`,
        [B],
      );
      assert.deepEqual(
        counts.map((r) => [r.vehicle_id, Number(r.views)]),
        [[V, 2]],
      );
    });
  });

  test("old views drop out of the window", async () => {
    await tx(async () => {
      await db.query(
        `insert into public.storefront_events (tenant_id, kind, vehicle_id, created_at)
         values ($1, 'vehicle_view', $2, now() - interval '40 days')`,
        [B, V],
      );
      assert.equal(
        (await rows(db, `select * from public.storefront_vehicle_popularity($1, 30)`, [B])).length,
        0,
      );
    });
  });

  test("logged-in staff and visitors can't call it", async () => {
    const staff = await asUser(db, B_OWNER, () =>
      attempt(db, () =>
        rows(db, `select * from public.storefront_vehicle_popularity($1, 30)`, [B]),
      ),
    );
    assert.equal(staff.ok, false);
    const visitor = await asUser(db, null, () =>
      attempt(db, () =>
        rows(db, `select * from public.storefront_vehicle_popularity($1, 30)`, [B]),
      ),
    );
    assert.equal(visitor.ok, false);
  });
});

describe("migrating existing data", () => {
  const open: PGlite[] = [];
  after(async () => {
    for (const d of open) await d.close();
  });

  const schema = async (d: PGlite) => ({
    functions: await rows(
      d,
      `select p.proname, pg_get_function_identity_arguments(p.oid) a, md5(p.prosrc) src
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`,
    ),
    columns: await rows(
      d,
      `select table_name, column_name from information_schema.columns where table_schema = 'public' order by 1, 2`,
    ),
    constraints: await rows(
      d,
      `select conrelid::regclass::text t, conname from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`,
    ),
    triggers: await rows(
      d,
      `select c.relname, t.tgname, pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2`,
    ),
    indexes: await rows(
      d,
      `select indexname from pg_indexes where schemaname = 'public' order by 1`,
    ),
  });
  const vehicles = (d: PGlite) =>
    rows(
      d,
      `select to_jsonb(v) - 'storefront_description' - 'storefront_features' r from public.vehicles v order by id`,
    );

  test("changes no existing row and rolls back cleanly", async () => {
    const old = await createDatabase("00084");
    open.push(old);
    await seedTenant(old, "a");
    await old.query(`update public.vehicles set storefront_published = true`);
    const before_ = await schema(old);
    const data = await vehicles(old);

    await applyMigrations(old, "00085", "00085");
    assert.deepEqual(await vehicles(old), data);
    const [listed] = await rows<{ n: number }>(
      old,
      `select count(*)::int n from public.vehicles where storefront_published`,
    );
    assert.ok(listed.n > 0, "Listings survive");

    await old.exec(
      readFileSync(
        join(process.cwd(), "supabase/rollbacks/00085_storefront_listing_details_down.sql"),
        "utf8",
      ),
    );
    assert.deepEqual(await vehicles(old), data);
    assert.deepEqual(await schema(old), before_);
  });
});

describe("saving the website design, as the app does it", () => {
  // The exact statements manage.ts saveDraft() sends, as a dealership admin.
  const update = (tenant: string, config: string) =>
    rows(
      db,
      `update public.storefronts set draft_config = $2::jsonb, updated_by = $3 where tenant_id = $1 returning tenant_id`,
      [tenant, config, B_OWNER],
    );
  const insert = (tenant: string, config: string) =>
    rows(
      db,
      `insert into public.storefronts (tenant_id, draft_config, updated_by) values ($1, $2::jsonb, $3)`,
      [tenant, config, B_OWNER],
    );
  const draft = async (tenant: string) =>
    (
      await rows<{ d: unknown }>(
        db,
        `select draft_config d from public.storefronts where tenant_id = $1`,
        [tenant],
      )
    )[0]?.d;

  test("the first save makes the draft, and later saves change it", async () => {
    await asUser(db, B_OWNER, async () => {
      assert.equal(
        (await update(B, '{"headline":{"en":"One"}}')).length,
        0,
        "nothing to update yet",
      );
      await insert(B, '{"headline":{"en":"One"}}');
      assert.equal((await update(B, '{"headline":{"en":"Two"}}')).length, 1);
      assert.deepEqual(await draft(B), { headline: { en: "Two" } });
    });
  });

  test("an upsert that also writes tenant_id is refused, which is why the app doesn't send one", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () =>
        rows(
          db,
          `insert into public.storefronts (tenant_id, draft_config, updated_by) values ($1, '{}'::jsonb, $2)
           on conflict (tenant_id) do update set tenant_id = excluded.tenant_id, draft_config = excluded.draft_config`,
          [B, B_OWNER],
        ),
      ),
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.ok ? "" : outcome.error, /permission denied/);
  });

  test("saving can't reach another dealership's draft", async () => {
    await asUser(db, B_OWNER, async () => {
      assert.equal((await update(A, '{"headline":{"en":"Hijack"}}')).length, 0);
      const outcome = await attempt(db, () => insert(A, '{"headline":{"en":"Hijack"}}'));
      assert.equal(outcome.ok, false);
    });
  });

  test("staff without the permission can't save", async () => {
    const plain = id("b", "plainUser");
    const outcome = await asUser(db, plain, () =>
      attempt(db, () =>
        rows(
          db,
          `insert into public.storefronts (tenant_id, draft_config, updated_by) values ($1, '{}'::jsonb, $2)`,
          [B, plain],
        ),
      ),
    );
    assert.equal(outcome.ok, false);
  });
});
