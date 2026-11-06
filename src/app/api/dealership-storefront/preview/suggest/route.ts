import { jsonOk, requireApiUser } from "@/lib/api/http";
import { tenantClient } from "@/lib/server/privileged";
import { cleanTerm } from "@/lib/storefront/public-vehicle";
import { searchSuggestions } from "@/lib/storefront/vehicles";

/** Search suggestions in the admin's preview, from their own listed cars. */
export async function GET(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const term = cleanTerm(new URL(request.url).searchParams.get("q") ?? undefined);
  const suggestions = term ? await searchSuggestions(tenantClient(auth.context), term) : [];
  return jsonOk({ suggestions }, { headers: { "Cache-Control": "private, no-store" } });
}
