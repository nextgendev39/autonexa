import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { readCustomerListQuery } from "@/lib/customers/list-query";
import { listCustomersPage } from "@/lib/customers/service";

/**
 * One page of customers:
 * ?filter=all|active|new|none|unassigned&sort=newest|recent|bookings|name&q=&page=1&pageSize=24
 */
export async function GET(request: Request) {
  const auth = await requireApiUser("customer.view");
  if ("response" in auth) return auth.response;
  const query = readCustomerListQuery(new URL(request.url).searchParams);
  const result = await listCustomersPage(auth.context, query);
  if (!result.data) {
    return jsonError(result.error?.code ?? "db_error", result.error?.message ?? "Could not load customers.", 400);
  }
  return jsonOk(result.data);
}
