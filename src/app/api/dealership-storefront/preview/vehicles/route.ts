import { jsonOk, requireApiUser } from "@/lib/api/http";
import { tenantClient } from "@/lib/server/privileged";
import { vehiclesByStockNumbers } from "@/lib/storefront/vehicles";

const STOCK = /^[\p{L}\p{N} ._/-]{1,60}$/u;

/** Saved and recently viewed cards in the admin's preview. Listed cars only, as on the live site. */
export async function GET(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const stock = new URL(request.url).searchParams
    .getAll("stock")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => STOCK.test(value))
    .slice(0, 24);
  const vehicles = await vehiclesByStockNumbers(tenantClient(auth.context), stock);
  return jsonOk({ vehicles }, { headers: { "Cache-Control": "private, no-store" } });
}
