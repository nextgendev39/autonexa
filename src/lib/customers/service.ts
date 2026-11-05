import { customerOwners, profileNames, type BookingStatus } from "@/lib/bookings/service";
import {
  CUSTOMER_FILTERS,
  CUSTOMER_SORTERS,
  inCustomerFilter,
  matchesCustomerSearch,
  monthKey,
  type CustomerFilter,
  type CustomerListPage,
  type CustomerListQuery,
} from "@/lib/customers/list-query";
import { canViewAllBookings } from "@/lib/permissions/roles";
import { currentTenantClient } from "@/lib/server/privileged";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { EditCustomerValues } from "@/lib/validation/customer";
import type { UserContext } from "@/types/auth";

export type CustomerListItem = {
  id: string;
  code: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  emirate: string | null;
  city: string | null;
  branchName: string | null;
  createdAt: string;
  /** The sales executive this customer belongs to (from their first booking). */
  salesperson: { id: string; name: string } | null;
  bookings: { total: number; active: number; lastAt: string | null };
  /** Super Admins and the salesperson who added the customer can edit their details. */
  canEdit: boolean;
};

type CustomerRow = {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string;
  email: string | null;
  emirate: string | null;
  city: string | null;
  created_at: string;
  created_by: string | null;
  branches: { name: string } | { name: string }[] | null;
};

type BookingRow = { customer_id: string; status: BookingStatus; reserved_at: string };

const CUSTOMER_SELECT =
  "id, customer_code, first_name, last_name, display_name, phone, email, emirate, city, created_at, created_by, branches(name)";

/**
 * Every customer visible to the caller, with booking stats and owner ids (names are
 * looked up separately, for just the customers that get shown). Reads use the caller's
 * session, so RLS scopes rows by branch. Roles that only see their own bookings
 * (everyone but Super Admins and Accountants) likewise only see customers they own or
 * created.
 */
async function loadCustomers(context: UserContext) {
  const supabase = await createClient();
  const [customers, bookings, owners] = await Promise.all([
    fetchAllRows<CustomerRow>((from, to) =>
      supabase
        .from("customers")
        .select(CUSTOMER_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<BookingRow>((from, to) =>
      supabase
        .from("reservations")
        .select("customer_id, status, reserved_at")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    customerOwners(),
  ]);
  if (customers.error) return { data: null, error: customers.error };

  const ownOnly = !canViewAllBookings(context.roles);
  const rows = customers.data.filter(
    (c) => !ownOnly || owners.get(c.id) === context.userId || c.created_by === context.userId,
  );

  const stats = new Map<string, CustomerListItem["bookings"]>();
  for (const b of bookings.data) {
    const s = stats.get(b.customer_id) ?? { total: 0, active: 0, lastAt: null };
    s.total += 1;
    if (b.status === "active") s.active += 1;
    if (!s.lastAt || b.reserved_at > s.lastAt) s.lastAt = b.reserved_at;
    stats.set(b.customer_id, s);
  }

  const items: CustomerListItem[] = rows.map((c) => {
    const ownerId = owners.get(c.id);
    const branch = Array.isArray(c.branches) ? c.branches[0] : c.branches;
    return {
      id: c.id,
      code: c.customer_code,
      name: c.display_name,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      email: c.email,
      emirate: c.emirate,
      city: c.city,
      branchName: branch?.name ?? null,
      createdAt: c.created_at,
      // Name filled in by withOwnerNames for the customers actually shown.
      salesperson: ownerId ? { id: ownerId, name: "" } : null,
      bookings: stats.get(c.id) ?? { total: 0, active: 0, lastAt: null },
      canEdit: canEditCustomer(context, c.created_by),
    };
  });
  return { data: { items, ownOnly }, error: null };
}

export function canEditCustomer(context: UserContext, createdBy: string | null) {
  return context.roles.includes("super_admin") || (!!createdBy && createdBy === context.userId);
}

type CustomerError = { code: string; message: string; fieldErrors?: Record<string, string> };

/**
 * Updates a customer's contact details. Only Super Admins and the salesperson who added
 * the customer may; the write uses the service role once that check passes.
 */
export async function updateCustomer(
  id: string,
  values: EditCustomerValues,
  context: UserContext,
): Promise<{ error: CustomerError | null }> {
  const admin = (await currentTenantClient());
  const { data: customer } = await admin
    .from("customers")
    .select("id, created_by")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { error: { code: "not_found", message: "Customer not found." } };
  if (!canEditCustomer(context, (customer as { created_by: string | null }).created_by)) {
    return { error: { code: "forbidden", message: "You can't edit this customer." } };
  }

  const { error } = await admin
    .from("customers")
    .update({
      first_name: values.firstName,
      last_name: values.lastName,
      display_name: `${values.firstName} ${values.lastName}`,
      phone: values.phone,
      email: values.email || null,
      city: values.city || null,
    })
    .eq("id", id);
  if (error?.code === "23505") {
    return {
      error: {
        code: "customer_exists",
        message: "Another customer already has this phone number.",
        fieldErrors: { phone: "customers.edit.phoneExists" },
      },
    };
  }
  if (error) return { error: { code: "db_error", message: error.message } };
  return { error: null };
}

async function withOwnerNames(items: CustomerListItem[]) {
  const ids = [...new Set(items.flatMap((c) => (c.salesperson ? [c.salesperson.id] : [])))];
  const names = await profileNames(ids);
  return items.map((c) =>
    c.salesperson ? { ...c, salesperson: { ...c.salesperson, name: names.get(c.salesperson.id) ?? "—" } } : c,
  );
}

/**
 * One page of the Customers screen. Ownership and booking counts come from bookings, so
 * the server derives them for every visible customer, then filters, searches, counts and
 * sorts here and returns only the requested page.
 */
export async function listCustomersPage(context: UserContext, query: CustomerListQuery) {
  const result = await loadCustomers(context);
  if (!result.data) return { data: null, error: result.error };
  const { items: all, ownOnly } = result.data;
  const thisMonth = monthKey(new Date());

  const counts = Object.fromEntries(
    CUSTOMER_FILTERS.map((key) => [
      key,
      all.filter((c) => inCustomerFilter(c, key, thisMonth)).length,
    ]),
  ) as Record<CustomerFilter, number>;
  // Sales executives own every customer they see, so "unassigned" doesn't apply to them.
  const filter = ownOnly && query.filter === "unassigned" ? "all" : query.filter;

  const matching = all
    .filter((c) => inCustomerFilter(c, filter, thisMonth) && matchesCustomerSearch(c, query.q))
    .sort(CUSTOMER_SORTERS[query.sort]);
  // Past the last page (e.g. after a search narrows the list): show the last page instead.
  const pages = Math.max(1, Math.ceil(matching.length / query.pageSize));
  const page = Math.min(query.page, pages);
  const items = await withOwnerNames(
    matching.slice((page - 1) * query.pageSize, page * query.pageSize),
  );

  const data: CustomerListPage = {
    items,
    total: matching.length,
    page,
    pageSize: query.pageSize,
    counts,
    totalBookings: all.reduce((sum, c) => sum + c.bookings.total, 0),
    ownOnly,
  };
  return { data, error: null };
}
