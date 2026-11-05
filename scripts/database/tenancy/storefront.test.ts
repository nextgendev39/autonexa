import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations, asUser, attempt, createDatabase, rows } from "./harness";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/** Phase 4: the database's half of public storefronts. Each denial has a control. */
const A = ZOHAAN_TENANT_ID;
const B = SECOND_TENANT_ID;
const B_OWNER = id("b", "profile");
const BASE = "autonexa.test";
const CONFIG = JSON.stringify({ headline: { en: "Hello" } });
const PLATFORM_OWNER = "abababab-0000-4000-8000-000000000001";

let db: PGlite;

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");
  await db.query(`insert into auth.users (id, email) values ($1, 'p@autonexa.test')`, [PLATFORM_OWNER]);
  await db.query(`update public.profiles set status = 'active', tenant_id = null where id = $1`, [PLATFORM_OWNER]);
  await db.query(`delete from public.tenant_members where user_id = $1`, [PLATFORM_OWNER]);
  await db.query(`insert into public.platform_admins (user_id, role) values ($1, 'owner')`, [PLATFORM_OWNER]);
});

after(async () => {
  await db?.close();
});

/** Rolls back, so tests don't lean on each other. */
const tx = async (work: () => Promise<void>) => {
  await db.exec("begin");
  try {
    await work();
  } finally {
    await db.exec("rollback");
  }
};
const publish = (tenant: string) =>
  db.query(
    `insert into public.storefronts (tenant_id, status, draft_config, published_config, published_at)
     values ($1, 'published', $2::jsonb, $2::jsonb, now())
     on conflict (tenant_id) do update set status = 'published', published_config = excluded.published_config`,
    [tenant, CONFIG],
  );
const resolve = async (host: string) =>
  (await rows<{ r: { tenantId: string; kind: string; config: unknown } | null }>(
    db,
    `select public.storefront_resolve_host($1, $2) r`,
    [host, BASE],
  ))[0].r;
const verifiedDomain = (tenant: string, domain: string) =>
  db.query(
    `insert into public.tenant_domains (tenant_id, domain, verified_at, verification_status)
     values ($1, $2, now(), 'verified')`,
    [tenant, domain],
  );
const onPlan = (tenant: string, key: string, status = "active") =>
  db.query(
    `update public.tenant_subscriptions set status = 'cancelled' where tenant_id = $1 and status in ('trialing', 'active', 'past_due');
     `.split(";")[0],
    [tenant],
  ).then(() =>
    db.query(
      // Each one newer than the last, as separate transactions would be.
      `insert into public.tenant_subscriptions (tenant_id, plan_id, status, created_at)
       select $1, id, $3, now() + make_interval(mins => (select count(*)::int + 1 from public.tenant_subscriptions))
       from public.plans where key = $2`,
      [tenant, key, status],
    ),
  );
const setFeature = (planKey: string, feature: string, enabled: boolean) =>
  db.query(
    `update public.plan_features set enabled = $3
     where feature_key = $2 and plan_id = (select id from public.plans where key = $1)`,
    [planKey, feature, enabled],
  );

describe("which dealership a host belongs to", () => {
  test("a subdomain resolves to its dealership once published", async () => {
    await tx(async () => {
      assert.equal(await resolve(`second-dealership.${BASE}`), null, "Not published yet");
      await publish(B);
      const site = await resolve(`second-dealership.${BASE}`);
      assert.equal(site?.tenantId, B);
      assert.equal(site?.kind, "subdomain");
    });
  });

  test("another dealership's subdomain never gives this one", async () => {
    await tx(async () => {
      await publish(A);
      await publish(B);
      assert.equal((await resolve(`zohaan-motors.${BASE}`))?.tenantId, A);
      assert.equal((await resolve(`second-dealership.${BASE}`))?.tenantId, B);
    });
  });

  test("hosts are not case or whitespace sensitive", async () => {
    await tx(async () => {
      await publish(B);
      assert.equal((await resolve(`SECOND-Dealership.${BASE.toUpperCase()}`))?.tenantId, B);
    });
  });

  for (const host of [
    `www.${BASE}`,
    `app.${BASE}`,
    `admin.${BASE}`,
    `api.${BASE}`,
    `a.second-dealership.${BASE}`,
    `.${BASE}`,
    BASE,
    `second-dealership.${BASE}.evil.test`,
    `evilsecond-dealership.test`,
    "",
  ]) {
    test(`"${host}" resolves to nothing`, async () => {
      await tx(async () => {
        await publish(B);
        assert.equal(await resolve(host), null);
      });
    });
  }

  test("a slug we keep for ourselves can't become a site, even if a dealership has it", async () => {
    await tx(async () => {
      await db.exec(`update public.tenants set slug = 'admin' where id = '${B}'`);
      await publish(B);
      assert.equal(await resolve(`admin.${BASE}`), null);
    });
  });

  test("an unverified custom domain resolves to nothing", async () => {
    await tx(async () => {
      await publish(B);
      await db.query(`insert into public.tenant_domains (tenant_id, domain) values ($1, 'cars.example.com')`, [B]);
      assert.equal(await resolve("cars.example.com"), null);
    });
  });

  test("a verified custom domain resolves to its owner", async () => {
    await tx(async () => {
      await publish(B);
      await verifiedDomain(B, "cars.example.com");
      const site = await resolve("cars.example.com");
      assert.equal(site?.tenantId, B);
      assert.equal(site?.kind, "custom");
    });
  });

  test("each condition for being online takes the site down", async () => {
    const offline: [string, string[]][] = [
      ["unpublished", [`update public.storefronts set status = 'unpublished' where tenant_id = '${B}'`]],
      ["switched off by the platform", [`update public.storefronts set platform_disabled = true where tenant_id = '${B}'`]],
      ["suspended dealership", [`update public.tenants set status = 'suspended' where id = '${B}'`]],
    ];
    for (const [label, statements] of offline) {
      await tx(async () => {
        await publish(B);
        for (const statement of statements) await db.exec(statement);
        assert.equal(await resolve(`second-dealership.${BASE}`), null, label);
      });
    }
  });

  for (const status of ["expired", "cancelled"]) {
    test(`a ${status} subscription takes the site down`, async () => {
      await tx(async () => {
        await publish(B);
        await onPlan(B, "starter", status);
        assert.equal(await resolve(`second-dealership.${BASE}`), null);
      });
    });
  }

  test("visitors get published content, never the draft", async () => {
    await tx(async () => {
      await publish(B);
      await db.query(`update public.storefronts set draft_config = '{"headline":{"en":"Secret"}}' where tenant_id = $1`, [B]);
      assert.deepEqual((await resolve(`second-dealership.${BASE}`))?.config, JSON.parse(CONFIG));
    });
  });

  test("nothing about the host lookup reaches logged-in users or visitors", async () => {
    const staff = await asUser(db, B_OWNER, () =>
      attempt(db, () => rows(db, `select public.storefront_resolve_host('x', 'y')`)),
    );
    assert.equal(staff.ok, false);
  });
});

describe("domain verification", () => {
  const claim = async (tenant: string, user: string, domain: string) =>
    asUser(db, user, () =>
      attempt(db, () =>
        rows<{ id: string; verification_status: string; verification_token: string }>(
          db,
          `insert into public.tenant_domains (tenant_id, domain, verified_at, verification_status, ssl_status)
           values ($1, $2, now(), 'verified', 'active') returning id, verification_status, verification_token`,
          [tenant, domain],
        ),
      ),
    );

  test("a dealership can't declare its own domain verified", async () => {
    const outcome = await claim(B, B_OWNER, "mine.example.com");
    assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    if (outcome.ok) {
      assert.equal(outcome.value[0].verification_status, "pending");
      assert.ok(outcome.value[0].verification_token.length >= 32);
    }
  });

  test("nor flip it afterwards", async () => {
    await tx(async () => {
      const [row] = await rows<{ id: string }>(
        db,
        `insert into public.tenant_domains (tenant_id, domain) values ($1, 'late.example.com') returning id`,
        [B],
      );
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const outcome = await attempt(db, () =>
        rows(db, `update public.tenant_domains set verification_status = 'verified', verified_at = now() where id = $1`, [row.id]),
      );
      assert.equal(outcome.ok, false);
    });
  });

  test("platform staff can't declare one verified either", async () => {
    const outcome = await asUser(db, PLATFORM_OWNER, () =>
      rows<{ verification_status: string }>(
        db,
        `insert into public.tenant_domains (tenant_id, domain, verification_status) values ($1, 'staff.example.com', 'verified') returning verification_status`,
        [B],
      ),
    );
    assert.equal(outcome[0].verification_status, "pending");
  });

  test("a dealership can't claim a domain for another", async () => {
    const outcome = await claim(A, B_OWNER, "forged.example.com");
    assert.equal(outcome.ok, false);
  });

  test("another dealership's domains and tokens stay hidden", async () => {
    await tx(async () => {
      await db.query(`insert into public.tenant_domains (tenant_id, domain) values ($1, 'hidden.example.com')`, [A]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      assert.equal((await rows(db, `select 1 from public.tenant_domains where domain = 'hidden.example.com'`)).length, 0);
      const removed = await rows(db, `delete from public.tenant_domains where domain = 'hidden.example.com' returning 1`);
      assert.equal(removed.length, 0);
    });
  });

  test("typing a domain first doesn't take it from its real owner", async () => {
    await tx(async () => {
      const [squat] = await rows<{ id: string }>(
        db,
        `insert into public.tenant_domains (tenant_id, domain) values ($1, 'contested.example.com') returning id`,
        [A],
      );
      const [real] = await rows<{ id: string }>(
        db,
        `insert into public.tenant_domains (tenant_id, domain) values ($1, 'contested.example.com') returning id`,
        [B],
      );
      const [won] = await rows<{ r: boolean }>(db, `select public.storefront_record_domain_check($1, true, 'active') r`, [real.id]);
      assert.equal(won.r, true);
      const [lost] = await rows<{ r: boolean }>(db, `select public.storefront_record_domain_check($1, true, 'active') r`, [squat.id]);
      assert.equal(lost.r, false, "Once verified, a name has one owner");
      const [row] = await rows<{ verification_status: string; last_error: string }>(
        db,
        `select verification_status, last_error from public.tenant_domains where id = $1`,
        [squat.id],
      );
      assert.deepEqual(row, { verification_status: "failed", last_error: "claimed_by_another" });
      await publish(B);
      assert.equal((await resolve("contested.example.com"))?.tenantId, B);
    });
  });

  test("a domain that stops verifying stops resolving at once", async () => {
    await tx(async () => {
      await publish(B);
      const [row] = await rows<{ id: string }>(
        db,
        `insert into public.tenant_domains (tenant_id, domain) values ($1, 'lapsed.example.com') returning id`,
        [B],
      );
      await db.query(`select public.storefront_record_domain_check($1, true, 'active')`, [row.id]);
      assert.equal((await resolve("lapsed.example.com"))?.tenantId, B);
      await db.query(`select public.storefront_record_domain_check($1, false, null, 'record_missing')`, [row.id]);
      assert.equal(await resolve("lapsed.example.com"), null);
    });
  });

  test("staff can't call the function that records a check", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () => rows(db, `select public.storefront_record_domain_check(gen_random_uuid(), true, 'active')`)),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("plan restrictions", () => {
  const claimAsB = (domain: string) =>
    attempt(db, () => rows(db, `insert into public.tenant_domains (tenant_id, domain) values ($1, $2)`, [B, domain]));

  test("a plan without the website closes it, and the module to staff", async () => {
    await tx(async () => {
      await publish(B);
      await onPlan(B, "starter");
      assert.equal((await resolve(`second-dealership.${BASE}`))?.tenantId, B, "control");
      await setFeature("starter", "storefront", false);
      assert.equal(await resolve(`second-dealership.${BASE}`), null);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const [row] = await rows<{ yes: boolean }>(db, `select public.has_permission('storefront.manage') yes`);
      assert.equal(row.yes, false);
    });
  });

  test("Starter has no custom domains", async () => {
    await tx(async () => {
      await onPlan(B, "starter");
      const outcome = await claimAsB("no.example.com");
      assert.equal(outcome.ok, false);
      assert.match(outcome.ok ? "" : outcome.error, /plan_limit_exceeded:custom_domains/);
    });
  });

  test("Professional has exactly one", async () => {
    await tx(async () => {
      await onPlan(B, "professional");
      assert.equal((await claimAsB("first.example.com")).ok, true);
      const second = await claimAsB("second.example.com");
      assert.match(second.ok ? "" : second.error, /plan_limit_exceeded:custom_domains/);
    });
  });

  test("Enterprise has no limit", async () => {
    await tx(async () => {
      await onPlan(B, "enterprise");
      for (const n of [1, 2, 3, 4]) assert.equal((await claimAsB(`d${n}.example.com`)).ok, true);
    });
  });

  test("an expired subscription can't add one", async () => {
    await tx(async () => {
      await onPlan(B, "enterprise", "expired");
      const outcome = await claimAsB("late.example.com");
      assert.match(outcome.ok ? "" : outcome.error, /subscription_inactive/);
    });
  });

  test("dropping to a plan without custom domains stops them resolving", async () => {
    await tx(async () => {
      await publish(B);
      await verifiedDomain(B, "kept.example.com");
      await onPlan(B, "enterprise");
      assert.equal((await resolve("kept.example.com"))?.tenantId, B, "control");
      await onPlan(B, "starter");
      assert.equal(await resolve("kept.example.com"), null);
      assert.equal((await resolve(`second-dealership.${BASE}`))?.tenantId, B, "Its subdomain still works");
    });
  });

  test("seeded plans: who gets what", async () => {
    const seeded = await rows<{ key: string; feature_key: string; enabled: boolean }>(
      db,
      `select p.key, pf.feature_key, pf.enabled from public.plan_features pf
       join public.plans p on p.id = pf.plan_id where pf.feature_key like 'storefront%'`,
    );
    const on = (plan: string) =>
      seeded.filter((r) => r.key === plan && r.enabled).map((r) => r.feature_key).sort();
    assert.deepEqual(on("starter"), ["storefront"]);
    assert.deepEqual(on("growth"), ["storefront", "storefront_analytics"]);
    assert.deepEqual(on("enterprise"), ["storefront", "storefront_analytics", "storefront_booking", "storefront_custom_domain"]);
  });

  test("booking is off the site's flags when the plan lacks either half", async () => {
    await tx(async () => {
      await publish(B);
      await onPlan(B, "starter");
      const site = (await resolve(`second-dealership.${BASE}`)) as unknown as { bookingEnabled: boolean; analyticsEnabled: boolean };
      assert.equal(site.bookingEnabled, false);
      assert.equal(site.analyticsEnabled, false);
    });
  });
});

describe("publishing", () => {
  test("publishing copies the draft, and only a dealership's own", async () => {
    await asUser(db, B_OWNER, async () => {
      await rows(db, `insert into public.storefronts (tenant_id, draft_config) values ($1, $2::jsonb)`, [B, CONFIG]);
      await rows(db, `select public.storefront_publish()`);
      const [row] = await rows<{ status: string; published_config: unknown }>(
        db,
        `select status, published_config from public.storefronts where tenant_id = $1`,
        [B],
      );
      assert.equal(row.status, "published");
      assert.deepEqual(row.published_config, JSON.parse(CONFIG));
    });
  });

  test("unpublishing takes it offline and keeps the design", async () => {
    await tx(async () => {
      await publish(B);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await rows(db, `select public.storefront_unpublish()`);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      assert.equal(await resolve(`second-dealership.${BASE}`), null);
      const [row] = await rows<{ published_config: unknown }>(db, `select published_config from public.storefronts where tenant_id = $1`, [B]);
      assert.deepEqual(row.published_config, JSON.parse(CONFIG));
    });
  });

  test("a site the platform disabled can't be published around it", async () => {
    await tx(async () => {
      await publish(B);
      await db.exec(`update public.storefronts set platform_disabled = true where tenant_id = '${B}'`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const outcome = await attempt(db, () => rows(db, `select public.storefront_publish()`));
      assert.match(outcome.ok ? "" : outcome.error, /storefront_disabled/);
    });
  });

  test("staff can edit a draft and nothing else, even through the API directly", async () => {
    await tx(async () => {
      await publish(B);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const draft = await attempt(db, () =>
        rows(db, `update public.storefronts set draft_config = '{}' where tenant_id = $1 returning 1`, [B]),
      );
      assert.equal(draft.ok && draft.value.length, 1, "control");
      for (const set of [
        `status = 'published'`,
        `published_config = '{"x":1}'`,
        `platform_disabled = false`,
        `published_at = now()`,
      ]) {
        const outcome = await attempt(db, () => rows(db, `update public.storefronts set ${set} where tenant_id = $1`, [B]));
        assert.equal(outcome.ok, false, set);
      }
    });
  });

  test("another dealership's site can't be read or changed", async () => {
    await tx(async () => {
      await publish(A);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      assert.equal((await rows(db, `select 1 from public.storefronts where tenant_id = $1`, [A])).length, 0);
      const changed = await attempt(db, () =>
        rows(db, `update public.storefronts set draft_config = '{}' where tenant_id = $1 returning 1`, [A]),
      );
      assert.equal(changed.ok && changed.value.length > 0, false);
      const insert = await attempt(db, () =>
        rows(db, `insert into public.storefronts (tenant_id, draft_config) values ($1, '{}') on conflict do nothing returning 1`, [A]),
      );
      assert.equal(insert.ok && insert.value.length > 0, false);
    });
  });

  test("staff without the permission can't manage it", async () => {
    const plain = id("b", "plainUser");
    const outcome = await asUser(db, plain, () => attempt(db, () => rows(db, `select public.storefront_publish()`)));
    assert.equal(outcome.ok, false);
  });

  test("the platform can take a site down, audited, and lift it", async () => {
    await tx(async () => {
      await publish(B);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [PLATFORM_OWNER]);
      await db.exec("set local role authenticated");
      await rows(db, `select public.platform_set_storefront_disabled($1, true, 'abuse')`, [B]);
      await db.exec("reset role");
      assert.equal(await resolve(`second-dealership.${BASE}`), null);
      const [entry] = await rows<{ tenant_id: string; metadata: { reason: string } }>(
        db,
        `select tenant_id, metadata from public.platform_audit_logs where action = 'storefront.disabled'`,
      );
      assert.equal(entry.tenant_id, B);
      assert.equal(entry.metadata.reason, "abuse");
    });
  });

  test("platform staff see the overview but no enquiries", async () => {
    await asUser(db, PLATFORM_OWNER, async () => {
      const overview = await rows<Record<string, unknown>>(db, `select * from public.platform_storefront_overview()`);
      assert.equal(overview.length, 2);
      assert.equal((await rows(db, `select 1 from public.storefront_enquiries`)).length, 0);
      const events = await attempt(db, () => rows(db, `select 1 from public.storefront_events`));
      assert.equal(events.ok && events.value.length > 0, false);
    });
  });

  test("support can look, not switch off", async () => {
    await tx(async () => {
      await db.query(`update public.platform_admins set role = 'support' where user_id = $1`, [PLATFORM_OWNER]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [PLATFORM_OWNER]);
      await db.exec("set local role authenticated");
      assert.ok((await rows(db, `select * from public.platform_storefront_overview()`)).length > 0, "control");
      const outcome = await attempt(db, () => rows(db, `select public.platform_set_storefront_disabled($1, true)`, [B]));
      assert.equal(outcome.ok, false);
    });
  });

  test("a dealership admin has no overview", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () => rows(db, `select * from public.platform_storefront_overview()`)),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("listing cars", () => {
  test("nothing is listed until someone lists it", async () => {
    const [row] = await rows<{ n: number }>(db, `select count(*)::int n from public.vehicles where storefront_published`);
    assert.equal(row.n, 0);
  });

  test("an owner can list and unlist their car", async () => {
    await asUser(db, B_OWNER, async () => {
      await rows(db, `select public.storefront_set_vehicle_published($1, true)`, [id("b", "vehicle")]);
      const [row] = await rows<{ storefront_published: boolean }>(
        db,
        `select storefront_published from public.vehicles where id = $1`,
        [id("b", "vehicle")],
      );
      assert.equal(row.storefront_published, true);
    });
  });

  test("another dealership's car can't be listed", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () => rows(db, `select public.storefront_set_vehicle_published($1, true)`, [id("a", "vehicle")])),
    );
    assert.equal(outcome.ok, false);
  });

  test("editing a car doesn't let staff list it without the permission", async () => {
    await tx(async () => {
      await db.exec(`insert into public.roles (key, name) values ('editor_only', 'Editor') on conflict do nothing`);
      await db.exec(`insert into public.permissions (key, name, module) values ('vehicle.edit', 'x', 'vehicle'), ('vehicle.view', 'x', 'vehicle') on conflict do nothing`);
      await db.exec(`insert into public.role_permissions (role_id, permission_id)
        select r.id, p.id from public.roles r, public.permissions p where r.key = 'editor_only' and p.key in ('vehicle.edit', 'vehicle.view')`);
      const [role] = await rows<{ id: string }>(db, `select id from public.roles where key = 'editor_only'`);
      await db.query(`insert into public.user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`, [B, id("b", "plainUser"), role.id]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id("b", "plainUser")]);
      await db.exec("set local role authenticated");
      const mileage = await attempt(db, () =>
        rows(db, `update public.vehicles set mileage = 7 where id = $1 returning 1`, [id("b", "vehicle")]),
      );
      assert.equal(mileage.ok && mileage.value.length, 1, "control: they can edit it");
      const listed = await attempt(db, () =>
        rows(db, `update public.vehicles set storefront_published = true where id = $1`, [id("b", "vehicle")]),
      );
      assert.equal(listed.ok, false);
    });
  });

  test("splitting units carries the listing and adds no second car", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set quantity = 3, storefront_published = true where id = $1`, [id("b", "vehicle")]);
      const [split] = await rows<{ id: string }>(db, `select public.split_vehicle_units($1, 1, $2) id`, [id("b", "vehicle"), B_OWNER]);
      const [row] = await rows<{ storefront_published: boolean; split_from_id: string }>(
        db,
        `select storefront_published, split_from_id from public.vehicles where id = $1`,
        [split.id],
      );
      assert.equal(row.storefront_published, true);
      assert.equal(row.split_from_id, id("b", "vehicle"));
    });
  });
});

describe("booking eligibility, decided by the server", () => {
  const V = id("b", "vehicle");
  /** Eligible, then each test breaks one thing. Seed: minimum 5000, ready for sale, active booking. */
  const eligible = async () => {
    await db.exec(`update public.reservations set status = 'cancelled' where vehicle_id = '${V}'`);
    await db.query(
      `update public.vehicles set storefront_published = true, status = 'ready_for_sale',
         current_selling_price = 9000, minimum_selling_price = 5000 where id = $1`,
      [V],
    );
    await onPlan(B, "enterprise");
  };
  const check = async () =>
    (await rows<{ r: { eligible: boolean; reason: string | null; price: number | null } }>(
      db,
      `select public.storefront_booking_eligibility($1, $2) r`,
      [B, V],
    ))[0].r;

  test("an eligible car, at its public price (control)", async () => {
    await tx(async () => {
      await eligible();
      assert.deepEqual(await check(), { eligible: true, reason: null, price: 9000 });
    });
  });

  const BROKEN: [string, string, string][] = [
    ["not listed", "not_listed", `update public.vehicles set storefront_published = false where id = '${V}'`],
    ["not ready for sale", "not_available", `set local session_replication_role = replica; update public.vehicles set status = 'sold' where id = '${V}'; set local session_replication_role = origin`],
    ["has no minimum price", "no_minimum_price", `update public.vehicles set minimum_selling_price = null where id = '${V}'`],
    ["has no public price", "no_price", `update public.vehicles set current_selling_price = null where id = '${V}'; update public.vehicle_pricing set advertised_price = null, target_selling_price = null where vehicle_id = '${V}'`],
    ["priced under its minimum", "below_minimum", `update public.vehicles set current_selling_price = 4999 where id = '${V}'`],
    ["already booked", "already_booked", `update public.reservations set status = 'active' where vehicle_id = '${V}'`],
    ["archived", "not_found", `update public.vehicles set deleted_at = now() where id = '${V}'`],
  ];
  for (const [label, reason, statement] of BROKEN) {
    test(`refused when ${label}`, async () => {
      await tx(async () => {
        await eligible();
        await db.exec(statement);
        const result = await check();
        assert.equal(result.eligible, false);
        assert.equal(result.reason, reason);
        assert.equal(result.price, null, "No price comes back on a refusal");
      });
    });
  }

  test("refused when the plan has no website booking", async () => {
    await tx(async () => {
      await eligible();
      await setFeature("enterprise", "storefront_booking", false);
      assert.equal((await check()).reason, "not_on_plan");
    });
  });

  test("refused when the plan has no bookings module", async () => {
    await tx(async () => {
      await eligible();
      await setFeature("enterprise", "bookings", false);
      assert.equal((await check()).reason, "not_on_plan");
    });
  });

  test("another dealership's car is refused", async () => {
    const [row] = await rows<{ r: { reason: string } }>(
      db,
      `select public.storefront_booking_eligibility($1, $2) r`,
      [B, id("a", "vehicle")],
    );
    assert.equal(row.r.reason, "not_found");
  });

  test("a request never reserves the car", async () => {
    await tx(async () => {
      await eligible();
      await rows(db, `select public.storefront_submit_enquiry($1, $2, 'booking_request', 'A', 'B', '+971501112222')`, [B, V]);
      const [car] = await rows<{ status: string }>(db, `select status from public.vehicles where id = $1`, [V]);
      assert.equal(car.status, "ready_for_sale");
      const active = await rows(db, `select 1 from public.reservations where vehicle_id = $1 and status = 'active'`, [V]);
      assert.equal(active.length, 0);
    });
  });

  test("an ineligible request is refused and records nothing", async () => {
    await tx(async () => {
      await eligible();
      await db.exec(`update public.vehicles set current_selling_price = 1 where id = '${V}'`);
      await db.exec("savepoint s");
      await assert.rejects(
        db.query(`select public.storefront_submit_enquiry($1, $2, 'booking_request', 'A', 'B', '+971501113333')`, [B, V]),
        /booking_not_eligible/,
      );
      await db.exec("rollback to savepoint s");
      const made = await rows(db, `select 1 from public.customers where phone = '+971501113333'`);
      assert.equal(made.length, 0);
    });
  });

  test("the price on a request comes from the server, not from anything sent", async () => {
    await tx(async () => {
      await eligible();
      const [row] = await rows<{ id: string }>(
        db,
        `select public.storefront_submit_enquiry($1, $2, 'booking_request', 'A', 'B', '+971501114444') id`,
        [B, V],
      );
      const [enquiry] = await rows<{ quoted_price: string }>(db, `select quoted_price from public.storefront_enquiries where id = $1`, [row.id]);
      assert.equal(Number(enquiry.quoted_price), 9000);
    });
  });

  test("the public price is never the minimum", async () => {
    await tx(async () => {
      await db.query(
        `update public.vehicles set current_selling_price = null, minimum_selling_price = 5000 where id = $1`,
        [V],
      );
      await db.query(`update public.vehicle_pricing set advertised_price = null, target_selling_price = null where vehicle_id = $1`, [V]);
      const [row] = await rows<{ p: string | null }>(db, `select public.vehicle_public_price($1) p`, [V]);
      assert.equal(row.p, null);
    });
  });

  test("the booking trigger still backstops the minimum price", async () => {
    await tx(async () => {
      await eligible();
      await db.exec(`update public.vehicles set minimum_selling_price = null where id = '${V}'`);
      const outcome = await attempt(db, () =>
        rows(
          db,
          `insert into public.reservations (tenant_id, reservation_number, vehicle_id, customer_id, branch_id, amount, selling_price, status)
           values ($1, 'BK-Z', $2, $3, $4, 0, 9000, 'active')`,
          [B, V, id("b", "customer"), id("b", "branch")],
        ),
      );
      assert.equal(outcome.ok, false);
    });
  });
});

describe("enquiries reach the right CRM", () => {
  const submit = (tenant: string, phone: string, vehicle: string | null = null, kind = "enquiry") =>
    rows<{ id: string }>(
      db,
      `select public.storefront_submit_enquiry($1, $2, $3, 'Sam', 'Visitor', $4, 'sam@example.test', 'Hello') id`,
      [tenant, vehicle, kind, phone],
    );

  test("a new number creates a customer in that dealership only", async () => {
    await tx(async () => {
      const [made] = await submit(B, "+971507770001");
      const [enquiry] = await rows<{ tenant_id: string; customer_id: string }>(
        db,
        `select tenant_id, customer_id from public.storefront_enquiries where id = $1`,
        [made.id],
      );
      assert.equal(enquiry.tenant_id, B);
      const customers = await rows<{ tenant_id: string; id: string }>(
        db,
        `select tenant_id, id from public.customers where phone = '+971507770001'`,
      );
      assert.deepEqual(customers, [{ tenant_id: B, id: enquiry.customer_id }]);
    });
  });

  test("a known number links to the existing customer and changes nothing about them", async () => {
    await tx(async () => {
      const phone = "+971500000002"; // Tenant B's seeded customer.
      const before = await rows(db, `select to_jsonb(c) r from public.customers c where tenant_id = $1 and phone = $2`, [B, phone]);
      assert.equal(before.length, 1, "control: the seed has this customer");
      const [made] = await submit(B, phone);
      const after_ = await rows(db, `select to_jsonb(c) r from public.customers c where tenant_id = $1 and phone = $2`, [B, phone]);
      assert.deepEqual(after_, before);
      const [enquiry] = await rows<{ customer_id: string; first_name: string }>(
        db,
        `select customer_id, first_name from public.storefront_enquiries where id = $1`,
        [made.id],
      );
      assert.equal(enquiry.customer_id, id("b", "customer"));
      assert.equal(enquiry.first_name, "Sam", "What the visitor said is kept on the enquiry");
    });
  });

  test("the same number at two dealerships stays two customers", async () => {
    await tx(async () => {
      await submit(A, "+971507770003");
      await submit(B, "+971507770003");
      const rowsSeen = await rows<{ tenant_id: string }>(
        db,
        `select tenant_id from public.customers where phone = '+971507770003' order by tenant_id`,
      );
      assert.deepEqual(rowsSeen.map((r) => r.tenant_id), [A, B]);
    });
  });

  test("an enquiry can't name another dealership's car", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set storefront_published = true where id = $1`, [id("a", "vehicle")]);
      await db.exec("savepoint s");
      await assert.rejects(submit(B, "+971507770004", id("a", "vehicle")), /vehicle_not_available/);
      await db.exec("rollback to savepoint s");
    });
  });

  test("an enquiry can't name an unlisted car", async () => {
    await tx(async () => {
      await db.query(`update public.vehicles set storefront_published = false where id = $1`, [id("b", "vehicle")]);
      await db.exec("savepoint s");
      await assert.rejects(submit(B, "+971507770005", id("b", "vehicle")), /vehicle_not_available/);
      await db.exec("rollback to savepoint s");
    });
  });

  test("the alert goes to that dealership's admins, without the visitor's details", async () => {
    await tx(async () => {
      const [made] = await submit(B, "+971507770006");
      const alerts = await rows<{ user_id: string; tenant_id: string; message: string; data: unknown }>(
        db,
        `select user_id, tenant_id, message, data from public.notifications where entity_id = $1`,
        [made.id],
      );
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].user_id, B_OWNER);
      assert.equal(alerts[0].tenant_id, B);
      assert.ok(!JSON.stringify(alerts[0]).includes("+971507770006"));
    });
  });

  test("another dealership can't read or work it", async () => {
    await tx(async () => {
      const [made] = await submit(A, "+971507770007");
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      assert.equal((await rows(db, `select 1 from public.storefront_enquiries where id = $1`, [made.id])).length, 0);
      const changed = await attempt(db, () =>
        rows(db, `update public.storefront_enquiries set status = 'closed' where id = $1 returning 1`, [made.id]),
      );
      assert.equal(changed.ok && changed.value.length > 0, false);
    });
  });

  test("the owner can work it, and can't rewrite what was said", async () => {
    await tx(async () => {
      const [made] = await submit(B, "+971507770008");
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const status = await attempt(db, () =>
        rows(db, `update public.storefront_enquiries set status = 'contacted' where id = $1 returning 1`, [made.id]),
      );
      assert.equal(status.ok && status.value.length, 1, "control");
      const rewrite = await attempt(db, () =>
        rows(db, `update public.storefront_enquiries set message = 'x' where id = $1`, [made.id]),
      );
      assert.equal(rewrite.ok, false);
      const forged = await attempt(db, () =>
        rows(db, `insert into public.storefront_enquiries (tenant_id, first_name, last_name, phone) values ($1, 'a', 'b', 'c')`, [B]),
      );
      assert.equal(forged.ok, false, "Enquiries only come through the server");
    });
  });

  test("a logged-in user can't call the submit function", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () => rows(db, `select public.storefront_submit_enquiry($1, null, 'enquiry', 'a', 'b', '+1')`, [A])),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("rate limits", () => {
  const hit = async (key: string, max = 2) =>
    (await rows<{ r: boolean }>(db, `select public.storefront_rate_limit($1, $2, 3600) r`, [key, max]))[0].r;

  test("allows up to the limit, per key", async () => {
    await tx(async () => {
      assert.equal(await hit("a"), true);
      assert.equal(await hit("a"), true);
      assert.equal(await hit("a"), false);
      assert.equal(await hit("b"), true, "Another key is unaffected");
    });
  });

  test("resets after the window", async () => {
    await tx(async () => {
      await hit("c");
      await hit("c");
      await db.exec(`update public.storefront_rate_limits set window_start = now() - interval '2 hours' where key = 'c'`);
      assert.equal(await hit("c"), true);
    });
  });
});

describe("analytics", () => {
  const event = (tenant: string, kind: string, visitor: string, vehicle: string | null = null) =>
    db.query(`insert into public.storefront_events (tenant_id, kind, visitor_hash, vehicle_id) values ($1, $2, $3, $4)`, [
      tenant,
      kind,
      visitor,
      vehicle,
    ]);

  test("counts a dealership's own traffic, and only its own", async () => {
    await tx(async () => {
      await onPlan(B, "enterprise");
      await event(B, "page_view", "v1");
      await event(B, "page_view", "v1");
      await event(B, "vehicle_view", "v2", id("b", "vehicle"));
      await event(B, "enquiry", "v2");
      await event(B, "conversion", "v2");
      await event(A, "page_view", "other");
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const [{ r }] = await rows<{ r: Record<string, unknown> & { topVehicles: { views: number }[] } }>(
        db,
        `select public.storefront_analytics(30) r`,
      );
      assert.equal(r.visitors, 2);
      assert.equal(r.pageViews, 2);
      assert.equal(r.vehicleViews, 1);
      assert.equal(r.enquiries, 1);
      assert.equal(r.conversions, 1);
      assert.equal(r.topVehicles[0].views, 1);
    });
  });

  test("a plan without analytics refuses", async () => {
    await tx(async () => {
      await onPlan(B, "starter");
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const outcome = await attempt(db, () => rows(db, `select public.storefront_analytics(30)`));
      assert.equal(outcome.ok, false);
    });
  });

  test("raw events can't be read by anyone logged in", async () => {
    await tx(async () => {
      await event(B, "page_view", "secret-hash");
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [B_OWNER]);
      await db.exec("set local role authenticated");
      const outcome = await attempt(db, () => rows(db, `select visitor_hash from public.storefront_events`));
      assert.equal(outcome.ok, false);
    });
  });

  test("the function for any dealership is server-only", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () => rows(db, `select public.storefront_analytics_for($1, 30)`, [A])),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("someone not logged in", () => {
  const asAnon = async <T>(work: () => Promise<T>) => {
    await db.exec("begin");
    try {
      await db.exec("set local role anon");
      return await work();
    } finally {
      await db.exec("rollback");
    }
  };

  test("reaches nothing directly: every public read goes through the server", async () => {
    for (const table of ["storefronts", "storefront_enquiries", "storefront_events", "storefront_rate_limits", "tenant_domains"]) {
      const seen = await asAnon(() => attempt(db, () => rows(db, `select 1 from public.${table} limit 1`)));
      assert.equal(seen.ok && seen.value.length > 0, false, table);
    }
    for (const call of [
      `select public.storefront_resolve_host('x', 'y')`,
      `select public.storefront_submit_enquiry(gen_random_uuid(), null, 'enquiry', 'a', 'b', '+1')`,
      `select public.vehicle_public_price(gen_random_uuid())`,
      `select public.storefront_rate_limit('k', 1, 1)`,
    ]) {
      const outcome = await asAnon(() => attempt(db, () => rows(db, call)));
      assert.equal(outcome.ok, false, call);
    }
  });

  test("branding files are public, and SVG isn't accepted", async () => {
    const [bucket] = await rows<{ public: boolean; allowed_mime_types: string[] }>(
      db,
      `select public, allowed_mime_types from storage.buckets where id = 'storefront-assets'`,
    );
    assert.equal(bucket.public, true);
    assert.ok(!bucket.allowed_mime_types.some((type) => type.includes("svg")));
  });

  test("no logged-in user can write branding files directly", async () => {
    const outcome = await asUser(db, B_OWNER, () =>
      attempt(db, () =>
        rows(db, `insert into storage.objects (bucket_id, name) values ('storefront-assets', $1)`, [`${B}/x.png`]),
      ),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("migrating existing Zohaan Motors data", () => {
  const ROLLBACKS = ["00081_storefront_public_down.sql", "00080_storefront_core_down.sql"];
  const TABLES = ["vehicles", "customers", "reservations", "sales", "profiles", "branches", "tenants", "tenant_subscriptions"];
  const open: PGlite[] = [];
  after(async () => {
    await Promise.all(open.map((d) => d.close()));
  });
  const snapshot = async (d: PGlite) => {
    const out: Record<string, unknown> = {};
    for (const table of TABLES) {
      out[table] = (
        await rows<{ r: unknown }>(d, `select to_jsonb(t) - 'storefront_published' r from public.${table} t order by 1`)
      ).map((x) => x.r);
    }
    return out;
  };
  const schema = async (d: PGlite) => ({
    functions: await rows(d, `select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`),
    policies: await rows(d, `select tablename, policyname, cmd, qual, with_check from pg_policies order by 1, 2`),
    tables: await rows(d, `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
    columns: await rows(d, `select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' order by 1, 2`),
    constraints: await rows(d, `select conrelid::regclass::text t, conname from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    triggers: await rows(d, `select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2`),
    features: await rows(d, `select key from public.platform_features order by 1`),
    permissions: await rows(d, `select role, permission from public.platform_role_permissions order by 1, 2`),
    planFeatures: await rows(d, `select count(*)::int n from public.plan_features`),
  });

  test("lists nothing, publishes nothing, changes no row, and rolls back cleanly", async () => {
    const old = await createDatabase("00079");
    open.push(old);
    await seedTenant(old, "a");
    const data = await snapshot(old);
    const before_ = await schema(old);

    await applyMigrations(old, "00080", "00081");
    assert.deepEqual(await snapshot(old), data);
    const [listed] = await rows<{ n: number }>(old, `select count(*)::int n from public.vehicles where storefront_published`);
    assert.equal(listed.n, 0);
    assert.equal((await rows(old, `select 1 from public.storefronts`)).length, 0, "No site exists until someone makes one");

    for (const file of ROLLBACKS) {
      await old.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", file), "utf8"));
    }
    assert.deepEqual(await snapshot(old), data);
    assert.deepEqual(await schema(old), before_);
  });
});

