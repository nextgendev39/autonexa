import { jsonError, jsonOk } from "@/lib/api/http";
import { siteClient, siteFromRequest } from "@/lib/storefront/site";
import { vehiclesByStockNumbers } from "@/lib/storefront/vehicles";

const STOCK = /^[\p{L}\p{N} ._/-]{1,60}$/u;

/**
 * Cards for the cars a visitor saved or viewed, which only their browser knows. Public records of
 * listed cars only: an unlisted, sold or other dealership's stock number simply isn't returned.
 */
export async function GET(request: Request) {
  const site = await siteFromRequest(request);
  if (!site) return jsonError("not_found", "Not found.", 404);
  const stock = new URL(request.url).searchParams
    .getAll("stock")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => STOCK.test(value))
    .slice(0, 24);
  const vehicles = await vehiclesByStockNumbers(siteClient(site), stock);
  // Photo addresses are signed and short-lived, so nothing here may be cached publicly.
  return jsonOk({ vehicles }, { headers: { "Cache-Control": "private, no-store" } });
}
