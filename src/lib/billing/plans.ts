import "server-only";

import type { BillingPlan } from "@/components/billing/billing-client";
import { publicPlanCatalog } from "@/lib/server/privileged/billing";

/**
 * Plans on offer, at list price in this dealership's currency. The price actually charged is worked out
 * separately on checkout.
 */
export async function listPurchasablePlans(currency: string) {
  const { plans, prices } = await publicPlanCatalog();
  const price = (plan: (typeof plans)[number], cycle: "monthly" | "yearly") => {
    if (plan.currency === currency) {
      const own = Number(cycle === "monthly" ? plan.price_monthly : plan.price_yearly);
      if (own > 0) return own;
    }
    const other = prices.find((p) => p.plan_id === plan.id && p.currency === currency && p.billing_cycle === cycle);
    return other ? Number(other.amount) : null;
  };
  const options: BillingPlan[] = plans
    .filter((plan) => plan.is_active)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthly: price(plan, "monthly"),
      yearly: price(plan, "yearly"),
    }));
  return { options, names: new Map(plans.map((plan) => [plan.id, plan.name])) };
}
