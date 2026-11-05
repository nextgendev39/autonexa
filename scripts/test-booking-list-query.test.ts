/**
 * Bookings screen paging: URL params, tab filters, search and urgency order.
 * Run: npx tsx --test scripts/test-booking-list-query.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingToCollect,
  bookingUrgency,
  inBookingFilter,
  matchesBookingSearch,
  readBookingListQuery,
} from "../src/lib/bookings/list-query";
import type { BookingListItem } from "../src/lib/bookings/service";

const booking = (patch: Partial<BookingListItem> = {}): BookingListItem => ({
  id: "1",
  number: "BK-20261017-ABCDE",
  status: "active",
  deposit: 5000,
  sellingPrice: 100000,
  units: 1,
  totalPrice: 100000,
  balanceDue: 95000,
  balanceReceived: null,
  soldAt: null,
  currency: "AED",
  reservedAt: "2026-10-10T08:00:00.000Z",
  expiresAt: null,
  notes: null,
  cancelReason: null,
  cancelledAt: null,
  balanceAlertedAt: null,
  createdBy: null,
  autoCancelled: false,
  depositDueAt: null,
  balanceDueAt: "2026-10-20T08:00:00.000Z",
  balanceOverdue: false,
  cancellationHold: null,
  refund: null,
  can: { edit: false, sell: true, cancel: false, requestHold: false, reviewHold: false },
  vehicle: { id: "v", stockNumber: "AN-0042", title: "2024 Toyota Land Cruiser", status: "reserved" },
  customer: { id: "c", name: "Sara Ahmed", phone: "+971501234567" },
  salesperson: null,
  branchId: "b",
  ...patch,
});

test("reads the query with safe defaults", () => {
  assert.deepEqual(readBookingListQuery(new URLSearchParams()), {
    filter: "active",
    q: "",
    page: 1,
    pageSize: 25,
  });
  assert.deepEqual(
    readBookingListQuery(new URLSearchParams("filter=attention&q=%20sara%20&page=3&pageSize=50")),
    { filter: "attention", q: "sara", page: 3, pageSize: 50 },
  );
  // Unknown tabs, bad pages and odd page sizes fall back.
  assert.deepEqual(
    readBookingListQuery(new URLSearchParams("filter=nope&page=-2&pageSize=7")),
    { filter: "active", q: "", page: 1, pageSize: 25 },
  );
});

test("tabs: needs attention is no deposit or an overdue payment", () => {
  assert.equal(inBookingFilter(booking(), "attention"), false);
  assert.equal(inBookingFilter(booking({ depositDueAt: "2026-10-18T00:00:00Z" }), "attention"), true);
  assert.equal(inBookingFilter(booking({ balanceOverdue: true }), "attention"), true);
  assert.equal(inBookingFilter(booking({ status: "converted", balanceOverdue: true }), "attention"), false);
  assert.equal(inBookingFilter(booking({ status: "expired" }), "closed"), true);
  assert.equal(inBookingFilter(booking({ status: "converted" }), "sold"), true);
  assert.equal(inBookingFilter(booking({ status: "cancelled" }), "all"), true);
});

test("search covers number, car, stock, customer and phone digits", () => {
  const b = booking();
  assert.ok(matchesBookingSearch(b, "abcde"));
  assert.ok(matchesBookingSearch(b, "land cruiser"));
  assert.ok(matchesBookingSearch(b, "an-0042"));
  assert.ok(matchesBookingSearch(b, "sara"));
  assert.ok(matchesBookingSearch(b, "050 123"));
  assert.ok(!matchesBookingSearch(b, "12"));
  assert.ok(!matchesBookingSearch(b, "nissan"));
});

test("urgency puts overdue first, then the soonest deadline", () => {
  const overdue = booking({ balanceOverdue: true });
  const soon = booking({ depositDueAt: "2026-10-18T00:00:00Z" });
  const later = booking({ balanceDueAt: "2026-10-25T00:00:00Z" });
  const sorted = [later, soon, overdue].sort((x, y) => bookingUrgency(x) - bookingUrgency(y));
  assert.deepEqual(sorted, [overdue, soon, later]);
});

test("to collect subtracts deposit and balance received", () => {
  assert.equal(bookingToCollect(booking()), 95000);
  assert.equal(bookingToCollect(booking({ balanceReceived: 95000 })), 0);
  assert.equal(bookingToCollect(booking({ totalPrice: null })), 0);
});
