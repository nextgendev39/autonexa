import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, afterEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations, attempt, createDatabase, rows } from "./harness";
import { SECOND_TENANT_ID, ZOHAAN_TENANT_ID, id, seedTenant } from "./seed";

/**
 * Phase 5: the database's half of taking money. Tests run in one transaction that rolls back, so each
 * starts clean. Tenant B is the customer. Payment facts here stand in for what the gateway reports.
 */
const A = ZOHAAN_TENANT_ID;
const B = SECOND_TENANT_ID;
const B_OWNER = id("b", "profile");
const A_OWNER = id("a", "profile");
const STAFF = "cdcdcdcd-0000-4000-8000-000000000001";
const SUPPORT = "cdcdcdcd-0000-4000-8000-000000000002";

let db: PGlite;
let starter: string;
let growth: string;

before(async () => {
  db = await createDatabase();
  await seedTenant(db, "a");
  await seedTenant(db, "b");
  for (const [user, role] of [[STAFF, "billing"], [SUPPORT, "support"]]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [user, `${role}@autonexa.test`]);
    await db.query(`update public.profiles set status = 'active', tenant_id = null where id = $1`, [user]);
    await db.query(`delete from public.tenant_members where user_id = $1`, [user]);
    await db.query(`insert into public.platform_admins (user_id, role) values ($1, $2)`, [user, role]);
  }
  await db.exec(`update public.plans set price_monthly = 100, price_yearly = 1000 where key = 'starter'`);
  await db.exec(`update public.plans set price_monthly = 200, price_yearly = 2000 where key = 'growth'`);
  starter = (await rows<{ id: string }>(db, `select id from public.plans where key = 'starter'`))[0].id;
  growth = (await rows<{ id: string }>(db, `select id from public.plans where key = 'growth'`))[0].id;
  await db.exec(`insert into public.billing_entities (currency, legal_name, tax_id, address)
    values ('AED', 'AutoNexa FZ', 'TRN100', 'Dubai')`);
  await db.query(
    `insert into public.tenant_billing_profiles (tenant_id, legal_name, tax_id, country, currency, email)
     values ($1, 'Second Motors LLC', 'TRN200', 'AE', 'AED', 'accounts@second.test')`,
    [B],
  );
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});

const as = async (user: string) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
  await db.exec("set local role authenticated");
};
const asServer = async () => {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
};
const prepare = async (plan = starter, cycle = "monthly", isTest = false, gateway = "stripe") => {
  const [{ r }] = await rows<{ r: Record<string, unknown> & { checkoutId: string; invoiceId: string; amount: string; kind: string; error?: string } }>(
    db,
    `select public.billing_prepare_checkout($1, $2, $3, $4, $5, $6) r`,
    [B, plan, cycle, gateway, isTest, B_OWNER],
  );
  return r;
};
const pay = async (checkout: { checkoutId: string }, overrides: Partial<{ amount: number; currency: string; ref: string; isTest: boolean; session: string; gateway: string }> = {}) => {
  const [{ r }] = await rows<{ r: { result: string; reason?: string } }>(
    db,
    `select public.billing_apply_payment($1, $2, $3, $4, $5, $6, $7) r`,
    [
      overrides.gateway ?? "stripe",
      checkout.checkoutId,
      overrides.session ?? `cs_${checkout.checkoutId}`,
      overrides.ref ?? `pi_${checkout.checkoutId}`,
      overrides.amount ?? 10500,
      overrides.currency ?? "AED",
      overrides.isTest ?? false,
    ],
  );
  return r;
};
const currentSub = async (tenant = B) =>
  (
    await rows<{ id: string; plan_id: string; status: string; billing_cycle: string; current_period_end: string; amount: string; scheduled_plan_id: string | null; cancel_at_period_end: boolean }>(
      db,
      `select * from public.tenant_subscriptions where tenant_id = $1 and status in ('trialing', 'active', 'past_due') order by created_at desc limit 1`,
      [tenant],
    )
  )[0];
const invoiceOf = async (invoiceId: string) =>
  (await rows<Record<string, unknown>>(db, `select * from public.subscription_invoices where id = $1`, [invoiceId]))[0];
const giveSubscription = async (plan: string, cycle: string, endsIn = "20 days", status = "active") => {
  await db.query(
    `insert into public.tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, started_at, current_period_end, created_at)
     values ($1, $2, $3, $4, now() - interval '10 days', now() + $5::interval, now() - interval '10 days')`,
    [B, plan, status, cycle, endsIn],
  );
};

describe("checkout activates nothing", () => {
  test("starting one leaves the subscription exactly as it was", async () => {
    const before_ = await rows(db, `select to_jsonb(s) r from public.tenant_subscriptions s where tenant_id = $1`, [B]);
    const checkout = await prepare();
    assert.ok(checkout.checkoutId);
    assert.deepEqual(await rows(db, `select to_jsonb(s) r from public.tenant_subscriptions s where tenant_id = $1`, [B]), before_);
    const invoice = await invoiceOf(checkout.invoiceId);
    assert.equal(invoice.status, "issued");
    assert.equal(invoice.paid_at, null);
  });

  test("the plan's limits don't change until it's paid", async () => {
    await giveSubscription(starter, "monthly");
    await db.exec(`update public.plans set max_vehicles = 1 where key = 'starter'`);
    await db.exec(`update public.tenant_billing_profiles set currency = 'AED'`);
    await prepare(growth);
    const [{ state }] = await rows<{ state: { allowed: boolean } }>(db, `select public.tenant_limit_state($1, 'vehicles', 1) state`, [B]);
    assert.equal(state.allowed, false, "Still on Starter");
  });

  test("a logged-in user can't reach the functions that record payment", async () => {
    const checkout = await prepare();
    await as(B_OWNER);
    for (const call of [
      `select public.billing_apply_payment('stripe', '${checkout.checkoutId}', 's', 'p', 10500, 'AED', false)`,
      `select public.billing_prepare_checkout('${B}', '${starter}', 'monthly', 'stripe', true, '${B_OWNER}')`,
      `select public.billing_activate(c, i) from public.billing_checkouts c, public.subscription_invoices i limit 1`,
      `select public.billing_generate_renewal_invoices()`,
      `select public.billing_finish_refund('${checkout.checkoutId}', true, 'x')`,
      `select public.billing_record_failure('stripe', '${checkout.checkoutId}', 'x', 1, 'AED', 'x', false)`,
    ]) {
      const outcome = await attempt(db, () => rows(db, call));
      assert.equal(outcome.ok, false, call);
    }
  });

  test("nor write billing tables directly", async () => {
    const checkout = await prepare();
    await as(B_OWNER);
    for (const statement of [
      `update public.billing_checkouts set status = 'paid' returning 1`,
      `update public.subscription_invoices set status = 'paid' where id = '${checkout.invoiceId}' returning 1`,
      `update public.tenant_subscriptions set plan_id = '${growth}' returning 1`,
      `insert into public.subscription_transactions (tenant_id, invoice_id, amount) values ('${B}', '${checkout.invoiceId}', 1) returning 1`,
      `insert into public.billing_webhook_events (gateway, event_id, event_type) values ('stripe', 'x', 'y') returning 1`,
      `insert into public.billing_checkouts (tenant_id, invoice_id, kind, plan_id, billing_cycle, gateway) values ('${B}', '${checkout.invoiceId}', 'new', '${growth}', 'monthly', 'stripe') returning 1`,
      `update public.plans set price_monthly = 0 returning 1`,
      `insert into public.billing_tax_rates (country, label, rate) values ('ZZ', 'x', 0) returning 1`,
      `update public.billing_tax_rates set rate = 0 returning 1`,
    ]) {
      const outcome = await attempt(db, () => rows(db, statement));
      assert.equal(outcome.ok && outcome.value.length > 0, false, statement);
    }
  });
});

describe("what's charged is worked out on the server", () => {
  test("tax is added at the buyer's country's rate", async () => {
    const checkout = await prepare();
    assert.equal(Number(checkout.amount), 105);
    const invoice = await invoiceOf(checkout.invoiceId);
    assert.equal(Number(invoice.subtotal), 100);
    assert.equal(Number(invoice.tax_amount), 5);
    assert.equal(Number(invoice.tax_rate), 5);
    assert.equal(invoice.tax_label, "VAT");
    assert.equal(invoice.is_test, false);
  });

  test("India pays in rupees, at its own price and tax", async () => {
    await db.query(`insert into public.billing_entities (currency, legal_name) values ('INR', 'AutoNexa India')`);
    await db.query(`insert into public.plan_prices (plan_id, currency, billing_cycle, amount) values ($1, 'INR', 'monthly', 2000)`, [starter]);
    await db.query(`update public.tenant_billing_profiles set currency = 'INR', country = 'IN' where tenant_id = $1`, [B]);
    const checkout = await prepare(starter, "monthly", false, "razorpay");
    assert.equal(checkout.currency, "INR");
    assert.equal(Number(checkout.amount), 2360);
    assert.equal((await invoiceOf(checkout.invoiceId)).tax_label, "GST");
  });

  const refusals: [string, string, () => Promise<void>][] = [
    ["no billing details", "profile_required", async () => { await db.query(`delete from public.tenant_billing_profiles where tenant_id = $1`, [B]); }],
    ["no seller details", "seller_not_configured", async () => { await db.exec(`delete from public.billing_entities`); }],
    ["no tax rate for the country", "tax_not_configured", async () => { await db.query(`update public.tenant_billing_profiles set country = 'ZZ' where tenant_id = $1`, [B]); }],
    ["no price in that currency", "price_not_set", async () => { await db.query(`update public.tenant_billing_profiles set currency = 'INR' where tenant_id = $1`, [B]); await db.exec(`insert into public.billing_entities (currency, legal_name) values ('INR', 'x')`); }],
    ["a price of zero, which means not set", "price_not_set", async () => { await db.exec(`update public.plans set price_monthly = 0 where key = 'starter'`); }],
    ["a retired plan", "plan_not_available", async () => { await db.exec(`update public.plans set is_active = false where key = 'starter'`); }],
  ];
  for (const [label, error, setup] of refusals) {
    test(`refused with ${label}`, async () => {
      await setup();
      assert.equal((await prepare()).error, error);
    });
  }

  test("the seller and buyer on an invoice don't change with later edits", async () => {
    const checkout = await prepare();
    await db.exec(`update public.billing_entities set legal_name = 'Renamed'`);
    await db.query(`update public.tenant_billing_profiles set legal_name = 'Renamed' where tenant_id = $1`, [B]);
    const invoice = await invoiceOf(checkout.invoiceId);
    const snapshot = invoice.billing_snapshot as { seller: { name: string; taxId: string }; buyer: { name: string; taxId: string } };
    assert.equal(snapshot.seller.name, "AutoNexa FZ");
    assert.equal(snapshot.seller.taxId, "TRN100");
    assert.equal(snapshot.buyer.name, "Second Motors LLC");
    assert.equal(snapshot.buyer.taxId, "TRN200");
  });

  test("a checkout invoice's totals can't be changed, even by billing staff", async () => {
    const checkout = await prepare();
    await as(STAFF);
    const outcome = await attempt(db, () =>
      rows(db, `update public.subscription_invoices set amount = 1 where id = $1`, [checkout.invoiceId]),
    );
    assert.equal(outcome.ok, false);
  });
});

describe("a verified payment", () => {
  test("activates the plan, pays the invoice and records the money, together", async () => {
    const checkout = await prepare();
    assert.deepEqual(await pay(checkout), { result: "applied" });
    const sub = await currentSub();
    assert.equal(sub.plan_id, starter);
    assert.equal(sub.status, "active");
    assert.ok(new Date(sub.current_period_end) > new Date(Date.now() + 27 * 86400000));
    const invoice = await invoiceOf(checkout.invoiceId);
    assert.equal(invoice.status, "paid");
    assert.ok(invoice.paid_at);
    const [tx] = await rows<{ amount: string; status: string; gateway: string; provider_reference: string }>(
      db,
      `select amount, status, gateway, provider_reference from public.subscription_transactions where invoice_id = $1`,
      [checkout.invoiceId],
    );
    assert.equal(Number(tx.amount), 105);
    assert.equal(tx.status, "succeeded");
    assert.equal(tx.gateway, "stripe");
  });

  test("a yearly plan runs for a year", async () => {
    const checkout = await prepare(starter, "yearly");
    assert.equal(Number(checkout.amount), 1050);
    await pay(checkout, { amount: 105000 });
    assert.ok(new Date((await currentSub()).current_period_end) > new Date(Date.now() + 360 * 86400000));
  });

  test("the plan's limits and features apply straight away", async () => {
    await db.exec(`update public.plans set max_vehicles = 99 where key = 'starter'`);
    await pay(await prepare());
    const [{ state }] = await rows<{ state: { limit: number } }>(db, `select public.tenant_limit_state($1, 'vehicles', 1) state`, [B]);
    assert.equal(state.limit, 99);
    const [{ on }] = await rows<{ on: boolean }>(db, `select public.tenant_feature_enabled($1, 'storefront_booking') "on"`, [B]);
    assert.equal(on, false, "Starter's features");
  });

  test("the dealership's admins are told, and an email is queued, in the same transaction", async () => {
    const checkout = await prepare();
    await pay(checkout);
    const alerts = await rows<{ user_id: string; tenant_id: string }>(
      db,
      `select user_id, tenant_id from public.notifications where type = 'subscription_payment_received'`,
    );
    assert.deepEqual(alerts, [{ user_id: B_OWNER, tenant_id: B }]);
    const mail = await rows<{ tenant_id: string; invoice_id: string }>(
      db,
      `select tenant_id, invoice_id from public.billing_email_outbox where kind = 'payment_confirmation'`,
    );
    assert.deepEqual(mail, [{ tenant_id: B, invoice_id: checkout.invoiceId }]);
  });

  test("the same payment twice is one payment", async () => {
    const checkout = await prepare();
    assert.equal((await pay(checkout)).result, "applied");
    const period = new Date((await currentSub()).current_period_end).getTime();
    assert.equal((await pay(checkout)).result, "duplicate");
    const payments = await rows(db, `select 1 from public.subscription_transactions where invoice_id = $1`, [checkout.invoiceId]);
    assert.equal(payments.length, 1);
    assert.equal(new Date((await currentSub()).current_period_end).getTime(), period, "Not extended twice");
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'payment_confirmation'`)).length, 1);
  });
});

describe("a payment that doesn't match activates nothing, and is kept", () => {
  const before_ = async () => JSON.stringify(await rows(db, `select to_jsonb(s) r from public.tenant_subscriptions s where tenant_id = $1 order by id`, [B]));
  const cases: [string, string, Parameters<typeof pay>[1]][] = [
    ["too little", "amount_mismatch", { amount: 100 }],
    ["too much", "amount_mismatch", { amount: 999999 }],
    ["another currency", "currency_mismatch", { currency: "USD" }],
    ["test money for a live invoice", "mode_mismatch", { isTest: true }],
  ];
  for (const [label, reason, overrides] of cases) {
    test(label, async () => {
      const checkout = await prepare();
      const subs = await before_();
      assert.deepEqual(await pay(checkout, overrides), { result: "needs_review", reason });
      assert.equal(await before_(), subs, "No plan change");
      assert.equal((await invoiceOf(checkout.invoiceId)).status, "issued", "Not marked paid");
      const [row] = await rows<{ status: string; review_reason: string }>(
        db,
        `select status, review_reason from public.billing_checkouts where id = $1`,
        [checkout.checkoutId],
      );
      assert.deepEqual(row, { status: "needs_review", review_reason: reason });
      const money = await rows(db, `select 1 from public.subscription_transactions where invoice_id = $1`, [checkout.invoiceId]);
      assert.equal(money.length, 1, "The money is on record, so it can be refunded");
      const audit = await rows(db, `select 1 from public.platform_audit_logs where action = 'billing.payment_needs_review'`);
      assert.equal(audit.length, 1);
    });
  }

  test("a live payment for a test invoice", async () => {
    const checkout = await prepare(starter, "monthly", true);
    assert.equal((await pay(checkout, { isTest: false })).result, "needs_review");
  });

  test("an unknown checkout changes nothing", async () => {
    const result = await pay({ checkoutId: "99999999-0000-4000-8000-000000000000" });
    assert.equal(result.result, "unknown_checkout");
  });

  test("another gateway's event for this checkout changes nothing", async () => {
    const checkout = await prepare();
    assert.equal((await pay(checkout, { gateway: "razorpay" })).result, "unknown_checkout");
  });

  test("a session other than the one attached changes nothing", async () => {
    const checkout = await prepare();
    await db.query(`select public.billing_attach_session($1, 'cs_real')`, [checkout.checkoutId]);
    assert.equal((await pay(checkout, { session: "cs_forged" })).result, "session_mismatch");
    assert.equal((await pay(checkout, { session: "cs_real" })).result, "applied");
  });

  test("paying an abandoned checkout is flagged, not applied on top of the newer one", async () => {
    const first = await prepare();
    const second = await prepare();
    assert.equal((await pay(first)).reason, "late_payment");
    assert.equal((await rows<{ status: string }>(db, `select status from public.billing_checkouts where id = $1`, [second.checkoutId]))[0].status, "open");
    assert.equal((await pay(second)).result, "applied");
  });

  test("paying a voided invoice is flagged", async () => {
    const checkout = await prepare();
    await db.query(`update public.subscription_invoices set status = 'void' where id = $1`, [checkout.invoiceId]);
    assert.equal((await pay(checkout)).reason, "late_payment");
  });
});

describe("upgrades, downgrades and renewals", () => {
  const paidStarter = async (cycle = "monthly") => {
    const first = await prepare(starter, cycle);
    await pay(first, { amount: cycle === "yearly" ? 105000 : 10500 });
    return first;
  };

  test("an upgrade starts now, and the unused part of the last payment comes off", async () => {
    await paidStarter();
    // Half of the month has been used.
    await db.query(
      `update public.tenant_subscriptions set started_at = now() - interval '15 days', current_period_end = now() + interval '15 days' where tenant_id = $1 and status = 'active'`,
      [B],
    );
    const checkout = await prepare(growth);
    assert.equal(checkout.kind, "upgrade");
    const invoice = await invoiceOf(checkout.invoiceId);
    assert.equal(Number(invoice.subtotal), 200);
    // About half of 100, depending on how long this month is.
    const credit = Number(invoice.credit_amount);
    assert.ok(credit > 45 && credit < 55, `Credit ${credit}`);
    assert.ok(Math.abs(Number(invoice.tax_amount) - (200 - credit) * 0.05) < 0.01);
    assert.equal((await currentSub()).plan_id, starter, "Not until it's paid");
    await pay(checkout, { amount: Math.round(Number(invoice.amount) * 100) });
    assert.equal((await currentSub()).plan_id, growth);
    const current = await rows(db, `select 1 from public.tenant_subscriptions where tenant_id = $1 and status = 'active'`, [B]);
    assert.equal(current.length, 1, "One current subscription");
  });

  test("a credit never counts a test payment", async () => {
    const test_ = await prepare(starter, "monthly", true);
    await pay(test_, { isTest: true });
    await db.query(`update public.tenant_subscriptions set is_test = false where tenant_id = $1`, [B]);
    const checkout = await prepare(growth);
    assert.equal(Number((await invoiceOf(checkout.invoiceId)).credit_amount), 0);
  });

  test("a move down waits: checkout refuses it, and scheduling keeps the plan", async () => {
    await giveSubscription(growth, "monthly");
    assert.equal((await prepare(starter)).error, "schedule_downgrade");
    await as(B_OWNER);
    await rows(db, `select public.billing_schedule_change($1, 'monthly')`, [starter]);
    await asServer();
    const sub = await currentSub();
    assert.equal(sub.plan_id, growth, "Keeps what's been paid for");
    assert.equal(sub.scheduled_plan_id, starter);
  });

  test("yearly to monthly on the same plan waits too", async () => {
    await giveSubscription(starter, "yearly");
    assert.equal((await prepare(starter, "monthly")).error, "schedule_downgrade");
  });

  test("monthly to yearly on the same plan is immediate", async () => {
    await giveSubscription(starter, "monthly");
    assert.equal((await prepare(starter, "yearly")).kind, "upgrade");
  });

  test("a trial buying a plan starts fresh, with no credit", async () => {
    await giveSubscription(starter, "monthly", "5 days", "trialing");
    const checkout = await prepare(growth);
    assert.equal(checkout.kind, "new");
    assert.equal(Number((await invoiceOf(checkout.invoiceId)).credit_amount), 0);
  });

  test("an expired subscription can be bought back, and additions resume", async () => {
    await giveSubscription(starter, "monthly", "-30 days", "expired");
    const [{ state }] = await rows<{ state: { reason: string } }>(db, `select public.tenant_limit_state($1, 'vehicles', 1) state`, [B]);
    assert.equal(state.reason, "subscription_inactive", "control");
    const checkout = await prepare(starter);
    assert.equal(checkout.kind, "new");
    await pay(checkout);
    const [{ state: after_ }] = await rows<{ state: { reason: string | null } }>(db, `select public.tenant_limit_state($1, 'vehicles', 1) state`, [B]);
    assert.equal(after_.reason, null);
  });

  test("renewing early runs on from the end of the period, so nothing is lost", async () => {
    await paidStarter();
    const end = new Date((await currentSub()).current_period_end).getTime();
    const checkout = await prepare();
    assert.equal(checkout.kind, "renewal");
    await pay(checkout);
    const next = new Date((await currentSub()).current_period_end).getTime();
    assert.ok(next >= end + 27 * 86400000, "A whole further period");
  });

  test("renewing late runs from today, and clears past due", async () => {
    await giveSubscription(starter, "monthly", "-3 days", "past_due");
    const checkout = await prepare();
    assert.equal(checkout.kind, "renewal");
    await pay(checkout);
    const sub = await currentSub();
    assert.equal(sub.status, "active");
    assert.ok(new Date(sub.current_period_end) > new Date(Date.now() + 27 * 86400000));
  });

  test("renewal invoices go out a week ahead, once, and charge nobody", async () => {
    await giveSubscription(starter, "monthly", "5 days");
    const [{ n }] = await rows<{ n: number }>(db, `select public.billing_generate_renewal_invoices() n`);
    assert.equal(n, 1);
    const [{ again }] = await rows<{ again: number }>(db, `select public.billing_generate_renewal_invoices() again`);
    assert.equal(again, 0, "Only once");
    const [invoice] = await rows<{ kind: string; amount: string; status: string; id: string }>(
      db,
      `select * from public.subscription_invoices where tenant_id = $1 and kind = 'renewal'`,
      [B],
    );
    assert.equal(Number(invoice.amount), 105);
    assert.equal(invoice.status, "issued");
    assert.equal((await rows(db, `select 1 from public.subscription_transactions where invoice_id = $1`, [invoice.id])).length, 0);
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'invoice_issued'`)).length, 1);
  });

  test("a renewal checkout reuses the invoice already issued", async () => {
    await giveSubscription(starter, "monthly", "5 days");
    await rows(db, `select public.billing_generate_renewal_invoices()`);
    const checkout = await prepare();
    const invoices = await rows(db, `select 1 from public.subscription_invoices where tenant_id = $1 and kind = 'renewal'`, [B]);
    assert.equal(invoices.length, 1);
    assert.equal((await pay(checkout)).result, "applied");
  });

  test("a scheduled move down is what's billed at renewal, and takes effect when paid", async () => {
    await giveSubscription(growth, "monthly", "5 days");
    await db.query(
      `update public.tenant_subscriptions set scheduled_plan_id = $1, scheduled_cycle = 'monthly' where tenant_id = $2 and status = 'active'`,
      [starter, B],
    );
    await rows(db, `select public.billing_generate_renewal_invoices()`);
    const [invoice] = await rows<{ id: string; amount: string; plan_id: string }>(
      db,
      `select id, amount, plan_id from public.subscription_invoices where tenant_id = $1 and kind = 'renewal'`,
      [B],
    );
    assert.equal(invoice.plan_id, starter);
    assert.equal(Number(invoice.amount), 105);
    const [{ r }] = await rows<{ r: { checkoutId: string; error?: string } }>(
      db,
      `select public.billing_pay_invoice($1, $2, 'stripe', false, $3) r`,
      [B, invoice.id, B_OWNER],
    );
    assert.equal(r.error, undefined);
    const end = new Date((await currentSub()).current_period_end).getTime();
    assert.equal((await pay(r)).result, "applied");
    const sub = await currentSub();
    assert.equal(sub.plan_id, starter);
    assert.ok(new Date(sub.current_period_end).getTime() >= end + 27 * 86400000, "Starts when the paid period ends");
  });

  test("another dealership's invoice can't be paid as your own", async () => {
    await giveSubscription(starter, "monthly", "5 days");
    await rows(db, `select public.billing_generate_renewal_invoices()`);
    const [invoice] = await rows<{ id: string }>(db, `select id from public.subscription_invoices where tenant_id = $1 and kind = 'renewal'`, [B]);
    const [{ r }] = await rows<{ r: { error?: string } }>(
      db,
      `select public.billing_pay_invoice($1, $2, 'stripe', false, $3) r`,
      [A, invoice.id, A_OWNER],
    );
    assert.equal(r.error, "invoice_not_payable");
  });

  test("no renewal invoice for custom terms, no end date, or a subscription being cancelled", async () => {
    const [{ n }] = await rows<{ n: number }>(db, `select public.billing_generate_renewal_invoices() n`);
    assert.equal(n, 0, "Zohaan has no end date");
    await giveSubscription(starter, "custom", "5 days");
    assert.equal((await rows<{ n: number }>(db, `select public.billing_generate_renewal_invoices() n`))[0].n, 0);
    await db.query(`update public.tenant_subscriptions set billing_cycle = 'monthly', cancel_at_period_end = true where tenant_id = $1 and status = 'active'`, [B]);
    assert.equal((await rows<{ n: number }>(db, `select public.billing_generate_renewal_invoices() n`))[0].n, 0);
  });
});

describe("cancelling, failures and the lifecycle", () => {
  const sweep = () => rows(db, `select public.platform_subscription_sweep()`);

  test("cancelling keeps access until the paid period ends, then ends without grace", async () => {
    await giveSubscription(starter, "monthly");
    await as(B_OWNER);
    await rows(db, `select public.billing_set_cancel_at_period_end(true)`);
    await asServer();
    await sweep();
    assert.equal((await currentSub()).status, "active", "Still paid for");
    await db.query(`update public.tenant_subscriptions set current_period_end = now() - interval '1 minute' where tenant_id = $1 and status = 'active'`, [B]);
    await sweep();
    const [row] = await rows<{ status: string }>(db, `select status from public.tenant_subscriptions where tenant_id = $1 order by created_at desc limit 1`, [B]);
    assert.equal(row.status, "cancelled");
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'subscription_ended'`)).length, 1);
  });

  test("changing your mind before then keeps it going", async () => {
    await giveSubscription(starter, "monthly");
    await as(B_OWNER);
    await rows(db, `select public.billing_set_cancel_at_period_end(true)`);
    await rows(db, `select public.billing_set_cancel_at_period_end(false)`);
    await asServer();
    assert.equal((await currentSub()).cancel_at_period_end, false);
  });

  test("someone cancelling gets no reminder to renew", async () => {
    await giveSubscription(starter, "monthly", "3 days");
    await db.query(`update public.tenant_subscriptions set cancel_at_period_end = true where tenant_id = $1 and status = 'active'`, [B]);
    await sweep();
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'renewal_reminder'`)).length, 0);
  });

  test("reminders are emailed as well as shown", async () => {
    await giveSubscription(starter, "monthly", "3 days");
    await sweep();
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'renewal_reminder'`)).length, 1);
    assert.equal((await rows(db, `select 1 from public.notifications where type = 'subscription_expiring'`)).length, 1);
  });

  test("a failed payment records itself, alerts, and leaves the subscription alone", async () => {
    await giveSubscription(starter, "monthly");
    const checkout = await prepare();
    const period = new Date((await currentSub()).current_period_end).getTime();
    const [{ r }] = await rows<{ r: { result: string } }>(
      db,
      `select public.billing_record_failure('stripe', $1, 'evt_1', 10500, 'AED', 'card_declined', false) r`,
      [checkout.checkoutId],
    );
    assert.equal(r.result, "recorded");
    assert.equal(new Date((await currentSub()).current_period_end).getTime(), period);
    assert.equal((await invoiceOf(checkout.invoiceId)).status, "issued", "Still owed");
    const [tx] = await rows<{ status: string; failure_reason: string }>(
      db,
      `select status, failure_reason from public.subscription_transactions where invoice_id = $1`,
      [checkout.checkoutId === "" ? "" : checkout.invoiceId],
    );
    assert.deepEqual(tx, { status: "failed", failure_reason: "card_declined" });
    assert.equal((await rows(db, `select 1 from public.notifications where type = 'subscription_payment_failed'`)).length, 1);
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'payment_failed'`)).length, 1);
  });

  test("the same failure twice is one failure", async () => {
    const checkout = await prepare();
    for (const expected of ["recorded", "duplicate"]) {
      const [{ r }] = await rows<{ r: { result: string } }>(
        db,
        `select public.billing_record_failure('stripe', $1, 'evt_2', 10500, 'AED', 'x', false) r`,
        [checkout.checkoutId],
      );
      assert.equal(r.result, expected);
    }
  });

  test("failing then succeeding works, and a failed attempt counts as nothing received", async () => {
    await db.exec(`select 1`);
    const checkout = await prepare();
    await rows(db, `select public.billing_record_failure('stripe', $1, 'evt_3', 10500, 'AED', 'x', false)`, [checkout.checkoutId]);
    const retry = await prepare();
    assert.equal((await pay(retry)).result, "applied");
    const [report] = await asReport();
    assert.equal(Number(report.received), 105);
    assert.equal(Number(report.failed), 1);
  });

  test("an expired checkout can't then be paid into a plan", async () => {
    const checkout = await prepare();
    await rows(db, `select public.billing_expire_checkout('stripe', $1)`, [checkout.checkoutId]);
    assert.equal((await pay(checkout)).reason, "late_payment");
  });

  test("Zohaan's no-expiry subscription is untouched by all of this", async () => {
    await sweep();
    await rows(db, `select public.billing_generate_renewal_invoices()`);
    const [row] = await rows<{ status: string; current_period_end: string | null }>(
      db,
      `select status, current_period_end from public.tenant_subscriptions where tenant_id = $1`,
      [A],
    );
    assert.deepEqual(row, { status: "active", current_period_end: null });
  });
});

const asReport = async () => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [STAFF]);
  await db.exec("set local role authenticated");
  const report = await rows<{ currency: string; received: string; refunded: string; failed: string; tax: string }>(
    db,
    `select * from public.platform_billing_report(12)`,
  );
  await asServer();
  return report;
};

describe("refunds", () => {
  const paidTx = async () => {
    const checkout = await prepare();
    await pay(checkout);
    const [tx] = await rows<{ id: string }>(db, `select id from public.subscription_transactions where invoice_id = $1`, [checkout.invoiceId]);
    return { checkout, tx };
  };
  const prepareRefund = async (txId: string, amount: number) => {
    await as(STAFF);
    const outcome = await attempt(db, () =>
      rows<{ r: { refundId: string } }>(db, `select public.platform_prepare_refund($1, $2, 'reason') r`, [txId, amount]),
    );
    await asServer();
    return outcome;
  };

  test("starts pending, and only counts once the gateway confirms", async () => {
    const { tx } = await paidTx();
    const outcome = await prepareRefund(tx.id, 50);
    assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
    const refundId = outcome.ok ? outcome.value[0].r.refundId : "";
    assert.equal(Number((await asReport())[0].refunded), 0, "Not yet");
    await rows(db, `select public.billing_finish_refund($1, true, 're_1')`, [refundId]);
    assert.equal(Number((await asReport())[0].refunded), 50);
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'refund_issued'`)).length, 1);
  });

  test("can't exceed what was paid, counting those still pending", async () => {
    const { tx } = await paidTx();
    assert.equal((await prepareRefund(tx.id, 106)).ok, false, "More than was paid");
    assert.equal((await prepareRefund(tx.id, 100)).ok, true);
    assert.equal((await prepareRefund(tx.id, 6)).ok, false, "Pending counts");
    assert.equal((await prepareRefund(tx.id, 5)).ok, true);
  });

  test("a failed refund frees the amount again", async () => {
    const { tx } = await paidTx();
    const first = await prepareRefund(tx.id, 105);
    await rows(db, `select public.billing_finish_refund($1, false, null, 'gateway said no')`, [first.ok ? first.value[0].r.refundId : ""]);
    assert.equal((await prepareRefund(tx.id, 105)).ok, true);
  });

  test("only a real, successful payment can be refunded", async () => {
    const { checkout, tx } = await paidTx();
    await rows(db, `select public.billing_record_failure('stripe', $1, 'evt_9', 10500, 'AED', 'x', false)`, [checkout.checkoutId]);
    const [failed] = await rows<{ id: string }>(db, `select id from public.subscription_transactions where status = 'failed'`);
    assert.equal((await prepareRefund(failed.id, 1)).ok, false, "A failed payment");
    const refund = await prepareRefund(tx.id, 1);
    assert.equal((await prepareRefund(refund.ok ? refund.value[0].r.refundId : "", 1)).ok, false, "A refund");
  });

  test("zero and negative amounts are refused", async () => {
    const { tx } = await paidTx();
    assert.equal((await prepareRefund(tx.id, 0)).ok, false);
    assert.equal((await prepareRefund(tx.id, -5)).ok, false);
  });

  test("finishing twice does nothing the second time", async () => {
    const { tx } = await paidTx();
    const refund = await prepareRefund(tx.id, 10);
    const refundId = refund.ok ? refund.value[0].r.refundId : "";
    await rows(db, `select public.billing_finish_refund($1, true, 're_2')`, [refundId]);
    await rows(db, `select public.billing_finish_refund($1, false, null, 'late')`, [refundId]);
    const [row] = await rows<{ status: string }>(db, `select status from public.subscription_transactions where id = $1`, [refundId]);
    assert.equal(row.status, "succeeded");
    assert.equal((await rows(db, `select 1 from public.billing_email_outbox where kind = 'refund_issued'`)).length, 1);
  });

  test("a refund made at the gateway is recorded once", async () => {
    const { checkout } = await paidTx();
    const ref = `pi_${checkout.checkoutId}`;
    for (const expected of ["recorded", "duplicate"]) {
      const [{ r }] = await rows<{ r: { result: string } }>(
        db,
        `select public.billing_record_external_refund('stripe', $1, 're_ext', 2000, false) r`,
        [ref],
      );
      assert.equal(r.result, expected);
    }
    assert.equal(Number((await asReport())[0].refunded), 20);
  });

  test("our own refund arriving back by webhook isn't counted twice", async () => {
    const { checkout, tx } = await paidTx();
    const refund = await prepareRefund(tx.id, 10);
    await rows(db, `select public.billing_finish_refund($1, true, 're_own')`, [refund.ok ? refund.value[0].r.refundId : ""]);
    const [{ r }] = await rows<{ r: { result: string } }>(
      db,
      `select public.billing_record_external_refund('stripe', $1, 're_own', 1000, false) r`,
      [`pi_${checkout.checkoutId}`],
    );
    assert.equal(r.result, "duplicate");
  });

  test("a refund doesn't quietly end the subscription", async () => {
    const { tx } = await paidTx();
    await prepareRefund(tx.id, 105);
    assert.equal((await currentSub()).status, "active");
  });

  for (const [who, user] of [["a dealership admin", B_OWNER], ["support staff", SUPPORT]] as const) {
    test(`${who} can't refund`, async () => {
      const { tx } = await paidTx();
      await as(user);
      const outcome = await attempt(db, () => rows(db, `select public.platform_prepare_refund($1, 1)`, [tx.id]));
      assert.equal(outcome.ok, false);
      assert.match(outcome.ok ? "" : outcome.error, /not authorized/);
    });
  }
});

describe("reports", () => {
  test("test money never counts, and currencies are never added together", async () => {
    await pay(await prepare());
    const testCheckout = await prepare(starter, "yearly", true);
    await pay(testCheckout, { amount: 105000, isTest: true });
    await db.query(`insert into public.billing_entities (currency, legal_name) values ('INR', 'x')`);
    await db.query(`insert into public.plan_prices (plan_id, currency, billing_cycle, amount) values ($1, 'INR', 'yearly', 2000)`, [starter]);
    await db.query(`update public.tenant_billing_profiles set currency = 'INR', country = 'IN' where tenant_id = $1`, [B]);
    await db.query(`update public.tenant_subscriptions set status = 'cancelled' where tenant_id = $1`, [B]);
    const inr = await prepare(starter, "yearly", false, "razorpay");
    await pay(inr, { amount: 236000, currency: "INR", gateway: "razorpay" });
    const report = await asReport();
    const of = (currency: string) => report.find((row) => row.currency === currency);
    assert.equal(Number(of("AED")?.received), 105);
    assert.equal(Number(of("AED")?.tax), 5);
    assert.equal(Number(of("INR")?.received), 2360);
    assert.equal(Number(of("INR")?.tax), 360);
  });

  test("dealerships can't run one", async () => {
    await as(B_OWNER);
    const outcome = await attempt(db, () => rows(db, `select * from public.platform_billing_report()`));
    assert.equal(outcome.ok, false);
  });

  test("manual payments from Phase 3 still count, and still close an invoice", async () => {
    const [made] = await rows<{ id: string }>(db, `insert into public.subscription_invoices (tenant_id, amount) values ($1, 100) returning id`, [B]);
    await as(STAFF);
    await rows(db, `select public.platform_record_payment($1, 100, 'bank_transfer', 'R1')`, [made.id]);
    await asServer();
    assert.equal((await invoiceOf(made.id)).status, "paid");
    assert.equal(Number((await asReport())[0].received), 100);
  });

  test("a failed attempt doesn't help close a manual invoice", async () => {
    const [made] = await rows<{ id: string }>(db, `insert into public.subscription_invoices (tenant_id, amount) values ($1, 100) returning id`, [B]);
    await db.query(
      `insert into public.subscription_transactions (tenant_id, invoice_id, amount, status) values ($1, $2, 100, 'failed')`,
      [B, made.id],
    );
    await as(STAFF);
    await rows(db, `select public.platform_record_payment($1, 1)`, [made.id]);
    await asServer();
    assert.equal((await invoiceOf(made.id)).status, "issued");
  });
});

describe("tenant isolation", () => {
  test("a dealership sees only its own billing", async () => {
    const checkout = await prepare();
    await pay(checkout);
    await as(A_OWNER);
    for (const [table, where] of [
      ["billing_checkouts", `id = '${checkout.checkoutId}'`],
      ["subscription_invoices", `id = '${checkout.invoiceId}'`],
      ["subscription_transactions", `invoice_id = '${checkout.invoiceId}'`],
      ["tenant_billing_profiles", `tenant_id = '${B}'`],
    ]) {
      assert.equal((await rows(db, `select 1 from public.${table} where ${where}`)).length, 0, table);
    }
    await db.exec("reset role");
    await as(B_OWNER);
    for (const [table, where] of [
      ["billing_checkouts", `id = '${checkout.checkoutId}'`],
      ["subscription_invoices", `id = '${checkout.invoiceId}'`],
      ["subscription_transactions", `invoice_id = '${checkout.invoiceId}'`],
      ["tenant_billing_profiles", `tenant_id = '${B}'`],
    ]) {
      assert.equal((await rows(db, `select 1 from public.${table} where ${where}`)).length, 1, `control: ${table}`);
    }
  });

  test("staff without the permission see nothing", async () => {
    await pay(await prepare());
    await as(id("b", "plainUser"));
    assert.equal((await rows(db, `select 1 from public.billing_checkouts`)).length, 0);
    assert.equal((await rows(db, `select 1 from public.subscription_transactions`)).length, 0);
    const outcome = await attempt(db, () => rows(db, `select public.billing_quote($1, 'monthly')`, [starter]));
    assert.equal(outcome.ok, false);
  });

  test("a quote is always the caller's own, and shows no internals", async () => {
    await as(B_OWNER);
    const [{ q }] = await rows<{ q: Record<string, unknown> }>(db, `select public.billing_quote($1, 'monthly') q`, [starter]);
    assert.equal(q.total, 105);
    assert.ok(!("subscriptionId" in q));
  });

  test("a dealership can edit its own billing details and no other's", async () => {
    await as(B_OWNER);
    const own = await rows(db, `update public.tenant_billing_profiles set city = 'Dubai' where tenant_id = $1 returning 1`, [B]);
    assert.equal(own.length, 1, "control");
    const other = await attempt(db, () =>
      rows(db, `insert into public.tenant_billing_profiles (tenant_id, legal_name) values ($1, 'forged')`, [A]),
    );
    assert.equal(other.ok, false);
  });

  test("scheduling and cancelling affect only the caller's own", async () => {
    await giveSubscription(starter, "monthly");
    await as(A_OWNER);
    const outcome = await attempt(db, () => rows(db, `select public.billing_set_cancel_at_period_end(true)`));
    assert.equal(outcome.ok, false, "Zohaan has no end date, so nothing to cancel");
    await asServer();
    assert.equal((await currentSub()).cancel_at_period_end, false);
  });

  test("webhook history, tax and seller settings stay with platform staff", async () => {
    await db.exec(`insert into public.billing_webhook_events (gateway, event_id, event_type) values ('stripe', 'e', 't')`);
    await as(B_OWNER);
    assert.equal((await rows(db, `select 1 from public.billing_webhook_events`)).length, 0);
    assert.equal((await rows(db, `select 1 from public.billing_tax_rates`)).length, 0);
    assert.equal((await rows(db, `select 1 from public.billing_entities`)).length, 0);
    const outbox = await attempt(db, () => rows(db, `select 1 from public.billing_email_outbox`));
    assert.equal(outbox.ok, false, "Queued emails are server only");
    await asServer();
    await as(STAFF);
    assert.equal((await rows(db, `select 1 from public.billing_webhook_events`)).length, 1, "control");
  });

  test("nobody who isn't logged in reaches any of it", async () => {
    await db.exec("set local role anon");
    for (const table of ["billing_checkouts", "billing_webhook_events", "billing_email_outbox", "tenant_billing_profiles", "plan_prices", "billing_tax_rates"]) {
      const outcome = await attempt(db, () => rows(db, `select 1 from public.${table} limit 1`));
      assert.equal(outcome.ok && outcome.value.length > 0, false, table);
    }
    for (const call of [
      `select public.billing_apply_payment('stripe', gen_random_uuid(), 's', 'p', 1, 'AED', false)`,
      `select public.billing_quote(gen_random_uuid(), 'monthly')`,
      `select public.plan_price(gen_random_uuid(), 'AED', 'monthly')`,
    ]) {
      const outcome = await attempt(db, () => rows(db, call));
      assert.equal(outcome.ok, false, call);
    }
  });
});

describe("nothing about a card is stored", () => {
  test("no column could hold one", async () => {
    const columns = await rows<{ table_name: string; column_name: string }>(
      db,
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and (table_name like 'billing_%' or table_name like 'subscription_%' or table_name = 'tenant_billing_profiles')
         and column_name ~* '(card|pan|cvv|cvc|expiry_month|exp_year|account_number|iban|secret|api_key)'`,
    );
    assert.deepEqual(columns, []);
  });

  test("the webhook log holds no payload", async () => {
    const columns = await rows<{ column_name: string }>(
      db,
      `select column_name from information_schema.columns where table_name = 'billing_webhook_events' and data_type in ('json', 'jsonb')`,
    );
    assert.deepEqual(columns, []);
  });
});

describe("existing data", () => {
  test("Phase 5's migrations change no row, and roll back cleanly", async () => {
    await db.exec("rollback");
    const old = await createDatabase("00081");
    try {
      await seedTenant(old, "a");
      await old.query(`insert into public.subscription_invoices (tenant_id, amount, status) values ($1, 100, 'paid')`, [A]);
      const [inv] = await rows<{ id: string }>(old, `select id from public.subscription_invoices`);
      await old.query(`insert into public.subscription_transactions (tenant_id, invoice_id, amount) values ($1, $2, 100)`, [A, inv.id]);

      const PHASE5 = ["kind", "subtotal", "credit_amount", "tax_rate", "tax_label", "tax_amount", "plan_id", "billing_cycle", "billing_snapshot", "is_test", "status_", "gateway", "provider_reference", "failure_reason", "parent_transaction_id", "cancel_at_period_end", "scheduled_plan_id", "scheduled_cycle", "amount_", "currency_"];
      const snapshot = async () => {
        const out: Record<string, unknown> = {};
        for (const table of ["tenant_subscriptions", "subscription_invoices", "subscription_transactions", "plans", "tenants"]) {
          const data = await rows<{ r: Record<string, unknown> }>(old, `select to_jsonb(t) r from public.${table} t order by 1`);
          out[table] = data.map(({ r }) =>
            Object.fromEntries(Object.entries(r).filter(([key]) => !PHASE5.includes(key) && !(table === "tenant_subscriptions" && (key === "amount" || key === "currency")) && !(table === "subscription_transactions" && key === "status"))),
          );
        }
        return out;
      };
      const schema = async () => ({
        functions: await rows(old, `select p.proname, pg_get_function_identity_arguments(p.oid) a, pg_get_functiondef(p.oid) d
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`),
        policies: await rows(old, `select tablename, policyname, cmd, qual, with_check from pg_policies order by 1, 2`),
        tables: await rows(old, `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
        columns: await rows(old, `select table_name, column_name from information_schema.columns where table_schema = 'public' order by 1, 2`),
        constraints: await rows(old, `select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
      });
      const beforeData = await snapshot();
      const beforeSchema = await schema();
      await applyMigrations(old, "00082", "00083");
      assert.deepEqual(await snapshot(), beforeData);
      const [tx] = await rows<{ status: string; kind: string }>(old, `select status, kind from public.subscription_transactions`);
      assert.deepEqual(tx, { status: "succeeded", kind: "payment" }, "An old payment reads as money received");
      for (const file of ["00083_billing_flows_down.sql", "00082_billing_core_down.sql"]) {
        await old.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", file), "utf8"));
      }
      assert.deepEqual(await snapshot(), beforeData);
      assert.deepEqual(await schema(), beforeSchema);
    } finally {
      await old.close();
      await db.exec("begin");
    }
  });

  test("rolling back refuses to destroy real payment records", async () => {
    await pay(await prepare());
    await db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", "00083_billing_flows_down.sql"), "utf8"));
    await assert.rejects(
      db.exec(readFileSync(join(process.cwd(), "supabase/rollbacks", "00082_billing_core_down.sql"), "utf8")),
      /gateway billing records exist/,
    );
  });
});
