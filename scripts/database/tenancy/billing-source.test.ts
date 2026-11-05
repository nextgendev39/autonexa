import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { billingConfigFromEnv, gatewayForCurrency, mayCheckOut } from "../../../src/lib/billing/config";
import { billingEmail, type OutboxKind } from "../../../src/lib/billing/emails";
import { GatewayError, SignatureError, signaturesMatch, toMinorUnits } from "../../../src/lib/billing/gateway";
import { escapeHtml, renderInvoiceHtml, type InvoiceDocument } from "../../../src/lib/billing/invoice-html";
import { normalizeRazorpayEvent, razorpayGateway, verifyRazorpaySignature } from "../../../src/lib/billing/razorpay";
import { normalizeStripeEvent, stripeGateway, verifyStripeSignature } from "../../../src/lib/billing/stripe";
import { billingProfileSchema, checkoutSchema } from "../../../src/lib/validation/billing";
import { refundSchema, taxRateSchema } from "../../../src/lib/validation/platform";

const STRIPE_TEST = {
  BILLING_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  BILLING_TEST_TENANT_SLUGS: "sandbox-motors, other",
};

describe("turning billing on", () => {
  test("it's off unless asked for", () => {
    assert.equal(billingConfigFromEnv({}).mode, "off");
    assert.equal(billingConfigFromEnv({ BILLING_MODE: "off", STRIPE_SECRET_KEY: "sk_live_x" }).mode, "off");
  });

  test("an unknown mode stays off", () => {
    for (const BILLING_MODE of ["on", "LIVE", "production", "true"]) {
      const config = billingConfigFromEnv({ ...STRIPE_TEST, BILLING_MODE });
      assert.equal(config.mode, "off", BILLING_MODE);
      assert.ok(config.problem);
    }
  });

  test("live money needs its own approval, as well as live keys", () => {
    const live = { BILLING_MODE: "live", STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    assert.equal(billingConfigFromEnv(live).mode, "off", "No approval");
    assert.equal(billingConfigFromEnv({ ...live, BILLING_LIVE_APPROVED: "true" }).mode, "off", "Only exactly yes");
    assert.equal(billingConfigFromEnv({ ...live, BILLING_LIVE_APPROVED: "yes" }).mode, "live", "control");
  });

  test("live mode refuses test keys, which would hand out plans for free", () => {
    const config = billingConfigFromEnv({
      BILLING_MODE: "live",
      BILLING_LIVE_APPROVED: "yes",
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    assert.equal(config.mode, "off");
    assert.equal(
      billingConfigFromEnv({
        BILLING_MODE: "live",
        BILLING_LIVE_APPROVED: "yes",
        RAZORPAY_KEY_ID: "rzp_test_x",
        RAZORPAY_KEY_SECRET: "s",
        RAZORPAY_WEBHOOK_SECRET: "w",
      }).mode,
      "off",
    );
  });

  test("test mode refuses live keys, so a test can't move money", () => {
    assert.equal(billingConfigFromEnv({ ...STRIPE_TEST, STRIPE_SECRET_KEY: "sk_live_abc" }).mode, "off");
    assert.equal(
      billingConfigFromEnv({ BILLING_MODE: "test", RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w" }).mode,
      "off",
    );
  });

  test("a gateway with no webhook secret doesn't count, since nothing could be confirmed", () => {
    assert.equal(billingConfigFromEnv({ BILLING_MODE: "test", STRIPE_SECRET_KEY: "sk_test_abc" }).mode, "off");
  });

  test("a stand-in API works only in test mode", () => {
    assert.equal(billingConfigFromEnv({ ...STRIPE_TEST, STRIPE_API_BASE: "http://localhost:1" }).stripe?.apiBase, "http://localhost:1");
    const live = billingConfigFromEnv({
      BILLING_MODE: "live",
      BILLING_LIVE_APPROVED: "yes",
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_WEBHOOK_SECRET: "w",
      STRIPE_API_BASE: "http://evil.test",
    });
    assert.equal(live.stripe?.apiBase, "https://api.stripe.com");
  });

  test("in test mode only named dealerships can check out", () => {
    const config = billingConfigFromEnv(STRIPE_TEST);
    assert.equal(mayCheckOut(config, "sandbox-motors"), true);
    assert.equal(mayCheckOut(config, "zohaan-motors"), false, "A real dealership gets nothing free");
    assert.equal(mayCheckOut(config, ""), false);
    assert.equal(mayCheckOut(billingConfigFromEnv({ ...STRIPE_TEST, BILLING_TEST_TENANT_SLUGS: "" }), "sandbox-motors"), false, "Nobody by default");
    assert.equal(mayCheckOut(billingConfigFromEnv({}), "sandbox-motors"), false);
  });

  test("the gateway follows the currency, and is configurable", () => {
    const both = billingConfigFromEnv({
      ...STRIPE_TEST,
      RAZORPAY_KEY_ID: "rzp_test_x",
      RAZORPAY_KEY_SECRET: "s",
      RAZORPAY_WEBHOOK_SECRET: "w",
    });
    assert.equal(gatewayForCurrency(both, "AED"), "stripe");
    assert.equal(gatewayForCurrency(both, "INR"), "razorpay");
    assert.equal(gatewayForCurrency(both, "USD"), null);
    assert.equal(gatewayForCurrency(billingConfigFromEnv(STRIPE_TEST), "INR"), null, "Not configured");
    const swapped = billingConfigFromEnv({ ...STRIPE_TEST, BILLING_GATEWAY_INR: "stripe" });
    assert.equal(gatewayForCurrency(swapped, "INR"), "stripe");
  });
});

describe("stripe webhooks", () => {
  const secret = "whsec_test";
  const now = 1_800_000_000;
  const sign = (body: string, t = now, key = secret) =>
    `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
  const body = '{"id":"evt_1"}';

  test("a correct signature passes (control)", () => {
    assert.doesNotThrow(() => verifyStripeSignature(body, sign(body), secret, now));
  });

  const rejected: [string, () => void][] = [
    ["no header", () => verifyStripeSignature(body, null, secret, now)],
    ["an empty header", () => verifyStripeSignature(body, "", secret, now)],
    ["junk", () => verifyStripeSignature(body, "nonsense", secret, now)],
    ["no signature part", () => verifyStripeSignature(body, `t=${now}`, secret, now)],
    ["another secret", () => verifyStripeSignature(body, sign(body, now, "whsec_attacker"), secret, now)],
    ["a changed body", () => verifyStripeSignature('{"id":"evt_2"}', sign(body), secret, now)],
    ["an extra space in the body", () => verifyStripeSignature(`${body} `, sign(body), secret, now)],
    ["a replay from an hour ago", () => verifyStripeSignature(body, sign(body, now - 3600), secret, now)],
    ["a timestamp from the future", () => verifyStripeSignature(body, sign(body, now + 3600), secret, now)],
    ["a timestamp changed without re-signing", () => verifyStripeSignature(body, sign(body, now - 3600).replace(`t=${now - 3600}`, `t=${now}`), secret, now)],
    ["a non-hex signature", () => verifyStripeSignature(body, `t=${now},v1=zzzz`, secret, now)],
    ["an empty signature", () => verifyStripeSignature(body, `t=${now},v1=`, secret, now)],
  ];
  for (const [label, run] of rejected) {
    test(`rejects ${label}`, () => assert.throws(run, SignatureError));
  }

  test("signature comparison handles different lengths without throwing", () => {
    assert.equal(signaturesMatch("aabb", "aa"), false);
    assert.equal(signaturesMatch("", ""), false);
  });

  const session = (extra: Record<string, unknown>) => ({
    id: "evt_1",
    livemode: false,
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", client_reference_id: "chk_1", payment_status: "paid", ...extra } },
  });

  test("a paid session is a payment", () => {
    const event = normalizeStripeEvent(session({}));
    assert.equal(event.type, "paid");
    if (event.type === "paid") {
      assert.equal(event.sessionId, "cs_1");
      assert.equal(event.checkoutId, "chk_1");
    }
  });

  test("a completed session that hasn't settled isn't", () => {
    assert.equal(normalizeStripeEvent(session({ payment_status: "unpaid" })).type, "ignored");
  });

  test("mode comes from the event", () => {
    assert.equal(normalizeStripeEvent(session({})).live, false);
    assert.equal(normalizeStripeEvent({ ...session({}), livemode: true }).live, true);
    assert.equal(normalizeStripeEvent({ ...session({}), livemode: "true" }).live, false, "Only a real true");
  });

  test("a failed attempt is keyed per attempt, and carries no card details", () => {
    const event = normalizeStripeEvent({
      id: "evt_f",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_1",
          amount: 10500,
          currency: "aed",
          metadata: { checkout_id: "chk_1" },
          last_payment_error: { code: "card_declined", payment_method: { card: { last4: "4242", brand: "visa", exp_month: 12 } } },
        },
      },
    });
    assert.equal(event.type, "failed");
    if (event.type === "failed") {
      assert.equal(event.attemptReference, "evt_f");
      assert.equal(event.reason, "card_declined");
    }
    const text = JSON.stringify(event);
    for (const word of ["4242", "visa", "last4", "exp_month"]) assert.ok(!text.includes(word), word);
  });

  test("failure of an unrelated payment is ignored", () => {
    assert.equal(normalizeStripeEvent({ id: "e", type: "payment_intent.payment_failed", data: { object: { id: "pi" } } }).type, "ignored");
  });

  test("a refund made at the gateway is recognised", () => {
    const event = normalizeStripeEvent({
      id: "evt_r",
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", refunds: { data: [{ id: "re_1", amount: 500 }] } } },
    });
    assert.deepEqual(
      { type: event.type, ...(event.type === "refunded" ? { p: event.paymentReference, r: event.refundReference, a: event.amountMinor } : {}) },
      { type: "refunded", p: "pi_1", r: "re_1", a: 500 },
    );
  });

  test("anything else is ignored, and an event with no ID is refused", () => {
    assert.equal(normalizeStripeEvent({ id: "e", type: "customer.created", data: { object: {} } }).type, "ignored");
    assert.throws(() => normalizeStripeEvent({ type: "x" }), SignatureError);
  });
});

describe("razorpay webhooks", () => {
  const secret = "rzp_secret";
  const body = '{"event":"payment_link.paid"}';
  const sign = (text: string, key = secret) => createHmac("sha256", key).update(text).digest("hex");

  test("a correct signature passes (control)", () => {
    assert.doesNotThrow(() => verifyRazorpaySignature(body, sign(body), secret));
  });

  for (const [label, run] of [
    ["no header", () => verifyRazorpaySignature(body, null, secret)],
    ["another secret", () => verifyRazorpaySignature(body, sign(body, "attacker"), secret)],
    ["a changed body", () => verifyRazorpaySignature(`${body} `, sign(body), secret)],
    ["junk", () => verifyRazorpaySignature(body, "not-hex", secret)],
    ["an empty signature", () => verifyRazorpaySignature(body, "", secret)],
  ] as [string, () => void][]) {
    test(`rejects ${label}`, () => assert.throws(run, SignatureError));
  }

  test("an event with no ID can't be made idempotent, so it's refused", () => {
    assert.throws(() => normalizeRazorpayEvent({ event: "payment_link.paid" }, null), SignatureError);
  });

  test("a paid link is a payment", () => {
    const event = normalizeRazorpayEvent(
      { event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", reference_id: "chk_1" } } } },
      "evt_1",
    );
    assert.equal(event.type, "paid");
    if (event.type === "paid") {
      assert.equal(event.sessionId, "plink_1");
      assert.equal(event.checkoutId, "chk_1");
    }
  });

  test("a failed payment carries no card details", () => {
    const event = normalizeRazorpayEvent(
      {
        event: "payment.failed",
        payload: {
          payment: {
            entity: { id: "pay_1", amount: 100, currency: "INR", error_code: "BAD_REQUEST", notes: { checkout_id: "chk_1" }, card: { last4: "1111", network: "Visa" }, contact: "+919999999999", email: "a@b.test" },
          },
        },
      },
      "evt_2",
    );
    assert.equal(event.type, "failed");
    const text = JSON.stringify(event);
    for (const word of ["1111", "Visa", "+9199", "a@b.test"]) assert.ok(!text.includes(word), word);
  });

  test("expiry, refunds and anything else", () => {
    assert.equal(
      normalizeRazorpayEvent({ event: "payment_link.expired", payload: { payment_link: { entity: { reference_id: "c" } } } }, "e").type,
      "expired",
    );
    assert.equal(
      normalizeRazorpayEvent({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 5 } } } }, "e").type,
      "refunded",
    );
    assert.equal(normalizeRazorpayEvent({ event: "order.paid" }, "e").type, "ignored");
  });
});

describe("calling the gateways", () => {
  const capture = (response: Record<string, unknown>, status = 200) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response), { status });
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  };
  const stripeConfig = { secretKey: "sk_test_s", webhookSecret: "w", apiBase: "https://stripe.test" };
  const razorpayConfig = { keyId: "rzp_test_k", keySecret: "secret", webhookSecret: "w", apiBase: "https://razorpay.test" };
  const request = {
    checkoutId: "chk_1",
    invoiceNumber: "INV-1",
    description: "Growth plan, monthly",
    amountMinor: 10500,
    currency: "AED",
    customerEmail: "a@b.test",
    successUrl: "https://app.test/billing/return?checkout=chk_1",
    cancelUrl: "https://app.test/billing",
  };

  test("stripe: a hosted page, in the smallest unit, repeat-safe", async () => {
    const { calls, fetcher } = capture({ id: "cs_1", url: "https://checkout.stripe.test/x" });
    const session = await stripeGateway(stripeConfig, fetcher).createCheckout(request);
    assert.deepEqual(session, { sessionId: "cs_1", redirectUrl: "https://checkout.stripe.test/x" });
    const form = new URLSearchParams(String(calls[0].init.body));
    assert.equal(form.get("mode"), "payment");
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "10500");
    assert.equal(form.get("line_items[0][price_data][currency]"), "aed");
    assert.equal(form.get("client_reference_id"), "chk_1");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer sk_test_s");
    assert.equal(headers["Idempotency-Key"], "checkout-chk_1");
  });

  test("razorpay: a hosted link, in the smallest unit, authenticated", async () => {
    const { calls, fetcher } = capture({ id: "plink_1", short_url: "https://rzp.test/x" });
    const session = await razorpayGateway(razorpayConfig, fetcher).createCheckout({ ...request, currency: "INR" });
    assert.equal(session.sessionId, "plink_1");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.amount, 10500);
    assert.equal(body.currency, "INR");
    assert.equal(body.reference_id, "chk_1");
    assert.equal(body.accept_partial, false);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Basic ${Buffer.from("rzp_test_k:secret").toString("base64")}`);
  });

  test("stripe: what the gateway says is what counts", async () => {
    const { fetcher } = capture({ client_reference_id: "c", payment_status: "unpaid", payment_intent: null, amount_total: 1, currency: "aed", livemode: false });
    const state = await stripeGateway(stripeConfig, fetcher).getSession("cs_1");
    assert.equal(state.paid, false);
  });

  test("razorpay: reads the captured payment, and the mode from its own key", async () => {
    const { fetcher } = capture({ reference_id: "c", status: "paid", amount_paid: 500, currency: "INR", payments: [{ payment_id: "pay_1", status: "captured" }] });
    const state = await razorpayGateway(razorpayConfig, fetcher).getSession("plink_1");
    assert.equal(state.paid, true);
    assert.equal(state.paymentReference, "pay_1");
    assert.equal(state.amountMinor, 500);
    assert.equal(state.live, false);
  });

  test("refunds carry our own ID, so retrying can't refund twice", async () => {
    const stripe = capture({ id: "re_1", status: "succeeded" });
    await stripeGateway(stripeConfig, stripe.fetcher).refund({ paymentReference: "pi_1", amountMinor: 100, idempotencyKey: "refund-row" });
    assert.equal((stripe.calls[0].init.headers as Record<string, string>)["Idempotency-Key"], "refund-row");
    const razorpay = capture({ id: "rfnd_1" });
    await razorpayGateway(razorpayConfig, razorpay.fetcher).refund({ paymentReference: "pay_1", amountMinor: 100, idempotencyKey: "refund-row" });
    assert.equal((razorpay.calls[0].init.headers as Record<string, string>)["X-Razorpay-Idempotency"], "refund-row");
  });

  test("a gateway's refusal comes through as an error, with its status", async () => {
    const { fetcher } = capture({ error: { message: "No such session" } }, 404);
    await assert.rejects(stripeGateway(stripeConfig, fetcher).getSession("x"), (error: GatewayError) => error.status === 404);
  });

  test("a stripe refund that comes back failed is a failure", async () => {
    const { fetcher } = capture({ id: "re_1", status: "failed" });
    await assert.rejects(
      stripeGateway(stripeConfig, fetcher).refund({ paymentReference: "pi", amountMinor: 1, idempotencyKey: "k" }),
      GatewayError,
    );
  });

  test("session IDs can't change the path", async () => {
    const { calls, fetcher } = capture({});
    await stripeGateway(stripeConfig, fetcher).getSession("../../v1/refunds");
    assert.ok(!calls[0].url.includes("../"));
  });
});

describe("money", () => {
  test("smallest units, without float errors", () => {
    assert.equal(toMinorUnits(105), 10500);
    assert.equal(toMinorUnits("19.99"), 1999);
    assert.equal(toMinorUnits(0.07), 7);
    assert.equal(toMinorUnits(1.15), 115);
    assert.equal(toMinorUnits(2360), 236000);
  });

  test("nothing free or negative can be sent to a gateway", () => {
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "abc"]) {
      assert.throws(() => toMinorUnits(value), GatewayError, String(value));
    }
  });
});

describe("invoices", () => {
  const invoice: InvoiceDocument = {
    invoice_number: "INV-000123",
    status: "paid",
    kind: "new",
    description: "Growth plan, monthly",
    currency: "AED",
    amount: "105.00",
    subtotal: "100.00",
    credit_amount: "0",
    tax_rate: "5",
    tax_label: "VAT",
    tax_amount: "5.00",
    issued_at: "2026-01-02T00:00:00Z",
    due_at: null,
    paid_at: "2026-01-03T00:00:00Z",
    is_test: false,
    billing_snapshot: {
      seller: { name: "AutoNexa FZ", taxId: "TRN100", address: "Dubai" },
      buyer: { name: "Second Motors LLC", taxId: "TRN200", country: "AE" },
    },
  };
  const tx = { kind: "payment", status: "succeeded", amount: "105.00", currency: "AED", method: "stripe", reference: "pi_abc", occurred_at: "2026-01-03T00:00:00Z" };

  test("has what a tax invoice needs", () => {
    const html = renderInvoiceHtml(invoice, [tx]);
    for (const expected of ["Tax Invoice", "INV-000123", "AutoNexa FZ", "TRN100", "Second Motors LLC", "TRN200", "VAT (5%)", "AED 100.00", "AED 5.00", "AED 105.00", "pi_abc", "paid"]) {
      assert.ok(html.includes(expected), expected);
    }
  });

  test("anything typed in can't become markup", () => {
    const html = renderInvoiceHtml(
      {
        ...invoice,
        description: "<script>alert(1)</script>",
        billing_snapshot: { buyer: { name: '"><img src=x onerror=alert(1)>', address: "</style><script>x</script>" } },
      },
      [{ ...tx, reference: "<b>x</b>" }],
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("<b>x"));
    assert.equal(escapeHtml(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&#39;");
  });

  test("Arabic names render as they are", () => {
    assert.ok(renderInvoiceHtml({ ...invoice, billing_snapshot: { buyer: { name: "شركة السيارات" } } }, []).includes("شركة السيارات"));
  });

  test("a failed attempt doesn't count as received, and a refund comes off", () => {
    const html = renderInvoiceHtml(invoice, [
      tx,
      { ...tx, status: "failed", amount: "105.00", reference: "evt_f" },
      { ...tx, kind: "refund", amount: "-5.00", reference: "re_1" },
    ]);
    assert.ok(html.includes(">AED 100.00</td></tr>\n    \n"), "Received 100") ;
  });

  test("a test invoice says so plainly", () => {
    assert.ok(renderInvoiceHtml({ ...invoice, is_test: true }, []).includes("TEST MODE"));
    assert.ok(!renderInvoiceHtml(invoice, []).includes("TEST MODE"));
  });

  test("an invoice recorded by hand before all this still renders", () => {
    const html = renderInvoiceHtml(
      { ...invoice, subtotal: null, tax_amount: null, tax_label: null, tax_rate: null, billing_snapshot: null, kind: "manual" },
      [],
    );
    assert.ok(html.includes("<h1>Invoice</h1>"));
    assert.ok(!html.includes("Tax Invoice"));
  });
});

describe("emails", () => {
  const kinds: OutboxKind[] = ["payment_confirmation", "invoice_issued", "renewal_reminder", "payment_failed", "refund_issued", "subscription_ended"];

  for (const kind of kinds) {
    test(`${kind} has a subject, text and a link`, () => {
      const email = billingEmail(kind, { plan: "Growth", invoiceNumber: "INV-1", periodEnd: "2026-01-02", due: "2026-01-02", amount: 5, currency: "AED" }, "https://app.test/billing");
      assert.match(email.subject, /^AutoNexa: /);
      assert.ok(email.text.includes("https://app.test/billing"));
      assert.ok(email.html.includes('href="https://app.test/billing"'));
    });
  }

  test("values can't become markup", () => {
    const email = billingEmail("payment_confirmation", { plan: "<script>x</script>", invoiceNumber: "<b>" }, "https://app.test");
    assert.ok(!email.html.includes("<script>"));
    assert.ok(!email.html.includes("<b>"));
  });
});

describe("request schemas", () => {
  test("a checkout can't carry a price, tax, status or dealership", () => {
    const parsed = checkoutSchema.parse({
      planId: "11111111-1111-4111-8111-111111111111",
      cycle: "monthly",
      amount: 1,
      total: 1,
      tax: 0,
      status: "paid",
      tenant_id: "x",
      isTest: true,
      gateway: "stripe",
    });
    assert.deepEqual(Object.keys(parsed).sort(), ["cycle", "planId"]);
  });

  test("only two cycles, and only real IDs", () => {
    assert.equal(checkoutSchema.safeParse({ planId: "11111111-1111-4111-8111-111111111111", cycle: "weekly" }).success, false);
    assert.equal(checkoutSchema.safeParse({ planId: "x", cycle: "monthly" }).success, false);
    assert.equal(checkoutSchema.safeParse({ invoiceId: "11111111-1111-4111-8111-111111111111" }).success, true);
    assert.equal(checkoutSchema.safeParse({}).success, false);
  });

  test("only supported currencies and real country codes", () => {
    const base = { legalName: "x", country: "AE", currency: "AED" };
    assert.equal(billingProfileSchema.safeParse(base).success, true);
    assert.equal(billingProfileSchema.safeParse({ ...base, currency: "USD" }).success, false);
    assert.equal(billingProfileSchema.safeParse({ ...base, country: "UAE" }).success, false);
  });

  test("refunds are positive, and tax rates sane", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    assert.equal(refundSchema.safeParse({ transactionId: id, amount: 0 }).success, false);
    assert.equal(refundSchema.safeParse({ transactionId: id, amount: -1 }).success, false);
    assert.equal(taxRateSchema.safeParse({ country: "AE", label: "VAT", rate: 101 }).success, false);
  });
});

describe("the code itself", () => {
  const root = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const read = (file: string) => readFileSync(file, "utf8");
  const relative = (file: string) => file.slice(root.length + 1);
  const tsFiles = walk(join(root, "src")).filter((file) => /\.tsx?$/.test(file));
  const clientFiles = tsFiles.filter((file) => read(file).startsWith('"use client"'));

  test("no gateway secret is named in client code, or under a public prefix", () => {
    for (const file of clientFiles) {
      assert.doesNotMatch(read(file), /STRIPE_|RAZORPAY_|sk_test|sk_live|WEBHOOK_SECRET/, relative(file));
    }
    for (const file of tsFiles) {
      assert.doesNotMatch(read(file), /NEXT_PUBLIC_(STRIPE|RAZORPAY|BILLING)/, relative(file));
    }
    assert.doesNotMatch(read(join(root, ".env.example")), /NEXT_PUBLIC_(STRIPE|RAZORPAY|BILLING)/);
  });

  test("client code never imports the gateway layer", () => {
    for (const file of clientFiles) {
      const imports = [...read(file).matchAll(/^import (?!type )[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
      for (const source of imports) {
        assert.ok(!/lib\/billing\/(stripe|razorpay|gateway|service|config)|privileged/.test(source), `${relative(file)}: ${source}`);
      }
    }
  });

  test("the webhook reads the raw body, and is the only billing route with no session", () => {
    const webhook = read(join(root, "src/app/api/billing/webhooks/[gateway]/route.ts"));
    assert.match(webhook, /request\.text\(\)/);
    assert.doesNotMatch(webhook, /request\.json\(\)/);
    for (const file of walk(join(root, "src/app/api/billing")).filter((f) => f.endsWith("route.ts") && !f.includes("webhooks"))) {
      const source = read(file);
      assert.match(source, /requireApiUser\("billing\.manage"\)|getSessionUser\(\)/, relative(file));
    }
  });

  test("the webhook checks the signature before anything is parsed or stored", () => {
    const service = read(join(root, "src/lib/billing/service.ts"));
    const handler = service.slice(service.indexOf("export async function handleWebhook"));
    for (const [check, then] of [
      ["verifyStripeSignature", "normalizeStripeEvent"],
      ["verifyRazorpaySignature", "normalizeRazorpayEvent"],
      ["verifyRazorpaySignature", "claimWebhookEvent"],
    ]) {
      assert.ok(handler.indexOf(check) < handler.indexOf(then), `${check} before ${then}`);
    }
  });

  test("a payment is only ever applied from what the gateway itself reports", () => {
    const service = read(join(root, "src/lib/billing/service.ts"));
    const uses = [...service.matchAll(/applyPayment\(/g)];
    assert.equal(uses.length, 1, "One place applies payments");
    const settle = service.slice(service.indexOf("async function settleFromGateway"));
    assert.ok(settle.indexOf("gateway.getSession") < settle.indexOf("applyPayment("));
  });

  test("the return page takes nothing but an ID from the browser", () => {
    const page = read(join(root, "src/app/[locale]/(dashboard)/billing/return/page.tsx"));
    assert.match(page, /confirmCheckout\(id\)/);
    assert.doesNotMatch(page, /searchParams[^\n]*(paid|status|amount|session)/);
  });

  test("no billing code reads or stores card fields", () => {
    for (const file of walk(join(root, "src/lib/billing"))) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      assert.doesNotMatch(code, /\.(card|last4|exp_month|exp_year|cvc|cvv)\b/, relative(file));
    }
  });

  test("the platform's refund route checks its permission first", () => {
    const route = read(join(root, "src/app/api/platform/billing/refunds/route.ts"));
    assert.match(route, /const auth = await requirePlatformApi\("billing\.manage"\)/);
  });

  const load = (locale: string) => JSON.parse(read(join(root, `messages/${locale}.json`)));
  const flatten = (value: unknown, prefix = ""): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];

  test("English and Arabic have the same keys", () => {
    assert.deepEqual(flatten(load("ar").billing).sort(), flatten(load("en").billing).sort());
    assert.deepEqual(flatten(load("ar").platform).sort(), flatten(load("en").platform).sort());
  });

  test("every billing key the code uses exists", () => {
    const known = new Set(flatten(load("en").billing));
    const files = [...walk(join(root, "src/components/billing")), join(root, "src/app/[locale]/(dashboard)/billing/return/page.tsx")];
    const missing = files.flatMap((file) =>
      [...read(file).matchAll(/\bt\(\s*"([a-zA-Z_.]+)"/g)].map((m) => m[1]).filter((key) => !known.has(key)).map((key) => `${relative(file)}: ${key}`),
    );
    assert.deepEqual(missing, []);
  });

  test("every console label the billing pages can show exists", () => {
    const status = load("en").platform.status;
    for (const value of ["open", "paid", "failed", "expired", "superseded", "needs_review"]) assert.ok(status[`checkout_${value}`], value);
    for (const value of ["received", "processed", "failed", "ignored"]) assert.ok(status[`webhook_${value}`], value);
    for (const value of ["succeeded", "pending", "failed", "test"]) assert.ok(status[value], value);
    const methods = load("en").platform.methods;
    for (const value of ["stripe", "razorpay", "manual", "bank_transfer"]) assert.ok(methods[value], value);
  });
});
