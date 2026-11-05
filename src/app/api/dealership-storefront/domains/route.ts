import { jsonError, jsonOk, planFeatureGate, readJsonBody, requireApiUser } from "@/lib/api/http";
import { addDomain } from "@/lib/storefront/manage";
import { storefrontDomainSchema } from "@/lib/validation/storefront";

export async function POST(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const offPlan = planFeatureGate(auth.context, "storefront_custom_domain");
  if (offPlan) return offPlan;
  const parsed = storefrontDomainSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Enter a domain like cars.example.com.", 400);
  const { error } = await addDomain(auth.context, parsed.data.domain);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
