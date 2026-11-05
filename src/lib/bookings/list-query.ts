import type { BookingListItem } from "@/lib/bookings/service";

/** Tabs on the Bookings screen. */
export const BOOKING_FILTERS = ["active", "attention", "sold", "closed", "all"] as const;
export type BookingFilter = (typeof BOOKING_FILTERS)[number];

export const BOOKING_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_BOOKING_PAGE_SIZE = 25;

export type BookingListQuery = {
  filter: BookingFilter;
  q: string;
  page: number;
  pageSize: number;
};

export type BookingListSummary = {
  /** Selling price × units across active bookings. */
  activeValue: number;
  noDeposit: number;
  overdue: number;
  soldValue: number;
  /** Still owed on active bookings. */
  toCollect: number;
  currency: string;
};

export type BookingListPage = {
  items: BookingListItem[];
  /** Bookings matching the filter and search, across all pages. */
  total: number;
  page: number;
  pageSize: number;
  /** Per tab, ignoring the search, so the tab badges stay put while typing. */
  counts: Record<BookingFilter, number>;
  summary: BookingListSummary;
};

/** Reads the list query from URL params, falling back to safe defaults. */
export function readBookingListQuery(params: URLSearchParams): BookingListQuery {
  const filter = params.get("filter");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(params.get("pageSize") ?? "", 10);
  return {
    filter: (BOOKING_FILTERS as readonly string[]).includes(filter ?? "")
      ? (filter as BookingFilter)
      : "active",
    q: (params.get("q") ?? "").trim().slice(0, 100),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    pageSize: (BOOKING_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_BOOKING_PAGE_SIZE,
  };
}

/** Open bookings waiting on the customer: no deposit yet, or the full payment is late. */
export const needsAttention = (b: BookingListItem) =>
  b.status === "active" && (Boolean(b.depositDueAt) || b.balanceOverdue);

export const inBookingFilter = (b: BookingListItem, filter: BookingFilter) =>
  filter === "all" ||
  (filter === "active" && b.status === "active") ||
  (filter === "attention" && needsAttention(b)) ||
  (filter === "sold" && b.status === "converted") ||
  (filter === "closed" && (b.status === "cancelled" || b.status === "expired"));

/** Overdue payments first, then whichever deadline comes soonest. */
export const bookingUrgency = (b: BookingListItem) =>
  b.balanceOverdue ? 0 : new Date(b.depositDueAt ?? b.balanceDueAt ?? 0).getTime() || Infinity;

/** What the customer still owes once deposit and any balance received are counted. */
export const bookingToCollect = (b: BookingListItem) =>
  b.totalPrice == null
    ? 0
    : Math.max(0, Math.round((b.totalPrice - b.deposit - (b.balanceReceived ?? 0)) * 100) / 100);

/** Booking number, car, stock number, customer name or (3+ digits of) phone. */
export function matchesBookingSearch(b: BookingListItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  return (
    b.number.toLowerCase().includes(q) ||
    (b.vehicle?.title.toLowerCase().includes(q) ?? false) ||
    (b.vehicle?.stockNumber?.toLowerCase().includes(q) ?? false) ||
    (b.customer?.name.toLowerCase().includes(q) ?? false) ||
    (digits.length >= 3 && (b.customer?.phone.replace(/\D/g, "").includes(digits) ?? false))
  );
}
