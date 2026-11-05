import { appConfig } from "@/config/app";
import type { CustomerListItem } from "@/lib/customers/service";

/** Tabs on the Customers screen; "unassigned" is only offered to managers. */
export const CUSTOMER_FILTERS = ["all", "active", "new", "none", "unassigned"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

export const CUSTOMER_SORTS = ["newest", "recent", "bookings", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_PAGE_SIZES = [24, 48, 96] as const;
export const DEFAULT_CUSTOMER_PAGE_SIZE = 24;

export type CustomerListQuery = {
  filter: CustomerFilter;
  sort: CustomerSort;
  q: string;
  page: number;
  pageSize: number;
};

export type CustomerListPage = {
  items: CustomerListItem[];
  /** Customers matching the filter and search, across all pages. */
  total: number;
  page: number;
  pageSize: number;
  /** Per tab, ignoring the search, so the badges stay put while typing. */
  counts: Record<CustomerFilter, number>;
  /** Bookings across every visible customer. */
  totalBookings: number;
  /** Roles that only see their own bookings also only see their own customers. */
  ownOnly: boolean;
};

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

/** Reads the list query from URL params, falling back to safe defaults. */
export function readCustomerListQuery(params: URLSearchParams): CustomerListQuery {
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(params.get("pageSize") ?? "", 10);
  return {
    filter: oneOf(params.get("filter"), CUSTOMER_FILTERS, "all"),
    sort: oneOf(params.get("sort"), CUSTOMER_SORTS, "newest"),
    q: (params.get("q") ?? "").trim().slice(0, 100),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    pageSize: (CUSTOMER_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_CUSTOMER_PAGE_SIZE,
  };
}

const monthFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: appConfig.timezone,
  year: "numeric",
  month: "2-digit",
});

/** "2026-10" in the dealership's time zone, so "new this month" matches the calendar there. */
export const monthKey = (date: Date | string) =>
  monthFormat.format(typeof date === "string" ? new Date(date) : date).slice(0, 7);

/** Whether a customer belongs on a tab; `thisMonth` is monthKey(now). */
export const inCustomerFilter = (c: CustomerListItem, filter: CustomerFilter, thisMonth: string) =>
  filter === "all" ||
  (filter === "active" && c.bookings.active > 0) ||
  (filter === "new" && monthKey(c.createdAt) === thisMonth) ||
  (filter === "none" && c.bookings.total === 0) ||
  (filter === "unassigned" && !c.salesperson);

export const CUSTOMER_SORTERS: Record<
  CustomerSort,
  (a: CustomerListItem, b: CustomerListItem) => number
> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  // Never-booked customers go last.
  recent: (a, b) => (b.bookings.lastAt ?? "").localeCompare(a.bookings.lastAt ?? ""),
  bookings: (a, b) => b.bookings.total - a.bookings.total || b.bookings.active - a.bookings.active,
  name: (a, b) => a.name.localeCompare(b.name),
};

/** Name, code, email or (3+ digits of) phone; "050 123" matches "+97150123…". */
export function matchesCustomerSearch(c: CustomerListItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  return (
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q) ||
    (c.email?.toLowerCase().includes(q) ?? false) ||
    (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))
  );
}
