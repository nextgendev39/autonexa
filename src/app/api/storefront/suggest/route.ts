import { jsonError, jsonOk } from "@/lib/api/http";
import { cleanTerm } from "@/lib/storefront/public-vehicle";
import { siteClient, siteFromRequest } from "@/lib/storefront/site";
import { searchSuggestions } from "@/lib/storefront/vehicles";

/** As-you-type suggestions, from this dealership's listed cars only. */
export async function GET(request: Request) {
  const site = await siteFromRequest(request);
  if (!site) return jsonError("not_found", "Not found.", 404);
  const term = cleanTerm(new URL(request.url).searchParams.get("q") ?? undefined);
  const suggestions = term ? await searchSuggestions(siteClient(site), term) : [];
  return jsonOk({ suggestions }, { headers: { "Cache-Control": "private, max-age=30" } });
}
