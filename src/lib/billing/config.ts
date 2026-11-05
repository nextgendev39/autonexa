/**
 * Whether billing is on, and how. Pure, so its refusals can be tested. Off is the default, and live
 * money needs two separate settings plus keys that really are live: a typo can't turn it on, and test
 * keys can't take live orders. Secrets are read on the server only and never reach the browser.
 */
export type GatewayName = "stripe" | "razorpay";
export type BillingMode = "off" | "test" | "live";

export type BillingConfig = {
  mode: BillingMode;
  /** Why it's off, when it was asked to be on. */
  problem: string | null;
  gatewayFor: Record<string, GatewayName>;
  /** In test mode, the only dealerships allowed to check out. */
  testTenantSlugs: string[];
  stripe: { secretKey: string; webhookSecret: string; apiBase: string } | null;
  razorpay: { keyId: string; keySecret: string; webhookSecret: string; apiBase: string } | null;
};

const off = (problem: string | null): BillingConfig => ({
  mode: "off",
  problem,
  gatewayFor: {},
  testTenantSlugs: [],
  stripe: null,
  razorpay: null,
});

type Env = Record<string, string | undefined>;
const read = (env: Env, key: string) => env[key]?.trim() || "";

export function billingConfigFromEnv(env: Env = process.env): BillingConfig {
  const requested = read(env, "BILLING_MODE") || "off";
  if (requested === "off") return off(null);
  if (requested !== "test" && requested !== "live") return off(`Unknown BILLING_MODE "${requested}"`);
  if (requested === "live" && read(env, "BILLING_LIVE_APPROVED") !== "yes") {
    return off("Live billing needs BILLING_LIVE_APPROVED=yes");
  }
  const live = requested === "live";

  const stripeKey = read(env, "STRIPE_SECRET_KEY");
  const stripeWebhook = read(env, "STRIPE_WEBHOOK_SECRET");
  const razorpayId = read(env, "RAZORPAY_KEY_ID");
  const razorpaySecret = read(env, "RAZORPAY_KEY_SECRET");
  const razorpayWebhook = read(env, "RAZORPAY_WEBHOOK_SECRET");

  // Each key says what it is. Test mode refuses live keys, because a test run must not move money,
  // and live mode refuses test keys, because those "payments" would hand out plans for free.
  if (stripeKey && !stripeKey.startsWith(live ? "sk_live_" : "sk_test_") && !stripeKey.startsWith(live ? "rk_live_" : "rk_test_")) {
    return off(`STRIPE_SECRET_KEY isn't a ${requested} key`);
  }
  if (razorpayId && !razorpayId.startsWith(live ? "rzp_live_" : "rzp_test_")) {
    return off(`RAZORPAY_KEY_ID isn't a ${requested} key`);
  }

  // A stand-in API is only for tests. Live traffic only ever goes to the real one.
  const stripeBase = (!live && read(env, "STRIPE_API_BASE")) || "https://api.stripe.com";
  const razorpayBase = (!live && read(env, "RAZORPAY_API_BASE")) || "https://api.razorpay.com";

  const stripe =
    stripeKey && stripeWebhook ? { secretKey: stripeKey, webhookSecret: stripeWebhook, apiBase: stripeBase } : null;
  const razorpay =
    razorpayId && razorpaySecret && razorpayWebhook
      ? { keyId: razorpayId, keySecret: razorpaySecret, webhookSecret: razorpayWebhook, apiBase: razorpayBase }
      : null;
  if (!stripe && !razorpay) return off("No gateway has both its keys and its webhook secret");

  const choose = (key: string, fallback: GatewayName): GatewayName => {
    const value = read(env, key);
    return value === "stripe" || value === "razorpay" ? value : fallback;
  };

  return {
    mode: requested,
    problem: null,
    gatewayFor: { AED: choose("BILLING_GATEWAY_AED", "stripe"), INR: choose("BILLING_GATEWAY_INR", "razorpay") },
    testTenantSlugs: read(env, "BILLING_TEST_TENANT_SLUGS").split(",").map((slug) => slug.trim()).filter(Boolean),
    stripe,
    razorpay,
  };
}

/**
 * Stripe's test cards always succeed, so test mode against a real dealership would hand out paid plans
 * for free. Only dealerships named for testing can check out in it.
 */
export function mayCheckOut(config: BillingConfig, tenantSlug: string) {
  if (config.mode === "off") return false;
  if (config.mode === "live") return true;
  return config.testTenantSlugs.includes(tenantSlug);
}

export function gatewayForCurrency(config: BillingConfig, currency: string): GatewayName | null {
  const name = config.gatewayFor[currency];
  if (!name) return null;
  return (name === "stripe" ? config.stripe : config.razorpay) ? name : null;
}
