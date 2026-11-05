import { jsonError, readJsonBody } from "@/lib/api/http";
import { respond } from "@/lib/platform/api";
import { saveBillingEntity, savePlanPrices, saveTaxRate } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { billingEntitySchema, planPriceSchema, taxRateSchema } from "@/lib/validation/platform";

/**
 * Tax rates, seller details and prices in other currencies. The first check lets through anyone who can
 * see billing, and the specific one follows once the type of setting is known.
 */
export async function PUT(request: Request) {
  const auth = await requirePlatformApi("billing.view");
  if ("response" in auth) return auth.response;
  const body = (await readJsonBody(request)) as { type?: string } | null;
  const specific = await requirePlatformApi(body?.type === "price" ? "plans.manage" : "billing.manage");
  if ("response" in specific) return specific.response;

  if (body?.type === "tax") {
    const parsed = taxRateSchema.safeParse(body);
    if (!parsed.success) return jsonError("validation", "Check the country and rate.", 400);
    return respond((await saveTaxRate(parsed.data)).error);
  }
  if (body?.type === "entity") {
    const parsed = billingEntitySchema.safeParse(body);
    if (!parsed.success) return jsonError("validation", "Check the details.", 400);
    return respond((await saveBillingEntity(parsed.data)).error);
  }
  if (body?.type === "price") {
    const parsed = planPriceSchema.safeParse(body);
    if (!parsed.success) return jsonError("validation", "Check the prices.", 400);
    return respond((await savePlanPrices(parsed.data)).error);
  }
  return jsonError("validation", "Unknown setting.", 400);
}
