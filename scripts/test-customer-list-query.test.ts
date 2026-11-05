/**
 * Customers screen paging: URL params, tab filters, search and sort order.
 * Run: npx tsx --test scripts/test-customer-list-query.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_SORTERS,
  inCustomerFilter,
  matchesCustomerSearch,
  monthKey,
  readCustomerListQuery,
} from "../src/lib/customers/list-query";
import type { CustomerListItem } from "../src/lib/customers/service";

const customer = (patch: Partial<CustomerListItem> = {}): CustomerListItem => ({
  id: "1",
  code: "CUS-20261001-AB12C",
  name: "Sara Ahmed",
  firstName: "Sara",
  lastName: "Ahmed",
  phone: "+971501234567",
  email: "sara@example.com",
  emirate: "dubai",
  city: "Dubai",
  branchName: "Al Quoz",
  createdAt: "2026-10-05T08:00:00.000Z",
  salesperson: { id: "s", name: "Omar" },
  bookings: { total: 0, active: 0, lastAt: null },
  canEdit: false,
  ...patch,
});

test("reads the query with safe defaults", () => {
  assert.deepEqual(readCustomerListQuery(new URLSearchParams()), {
    filter: "all",
    sort: "newest",
    q: "",
    page: 1,
    pageSize: 24,
  });
  assert.deepEqual(
    readCustomerListQuery(new URLSearchParams("filter=new&sort=name&q=%20sara&page=2&pageSize=48")),
    { filter: "new", sort: "name", q: "sara", page: 2, pageSize: 48 },
  );
  assert.deepEqual(
    readCustomerListQuery(new URLSearchParams("filter=x&sort=y&page=0&pageSize=25")),
    { filter: "all", sort: "newest", q: "", page: 1, pageSize: 24 },
  );
});

test("tabs", () => {
  const thisMonth = monthKey("2026-10-17T10:00:00.000Z");
  const booked = customer({ bookings: { total: 2, active: 1, lastAt: "2026-10-10T00:00:00Z" } });
  assert.ok(inCustomerFilter(booked, "active", thisMonth));
  assert.ok(!inCustomerFilter(booked, "none", thisMonth));
  assert.ok(inCustomerFilter(customer(), "none", thisMonth));
  assert.ok(inCustomerFilter(customer(), "new", thisMonth));
  assert.ok(!inCustomerFilter(customer({ createdAt: "2026-09-20T00:00:00Z" }), "new", thisMonth));
  assert.ok(inCustomerFilter(customer({ salesperson: null }), "unassigned", thisMonth));
  assert.ok(!inCustomerFilter(customer(), "unassigned", thisMonth));
});

test("new this month uses the dealership's calendar (Dubai, UTC+4)", () => {
  // 21:30 UTC on 31 Oct is already 1 Nov in Dubai.
  assert.equal(monthKey("2026-10-31T21:30:00.000Z"), "2026-11");
  assert.equal(monthKey("2026-10-31T19:00:00.000Z"), "2026-10");
});

test("search covers name, code, email and phone digits", () => {
  const c = customer();
  assert.ok(matchesCustomerSearch(c, "sara"));
  assert.ok(matchesCustomerSearch(c, "ab12c"));
  assert.ok(matchesCustomerSearch(c, "example.com"));
  assert.ok(matchesCustomerSearch(c, "050 123"));
  // Fewer than 3 digits never matches on phone (and "99" is in no other field).
  assert.ok(!matchesCustomerSearch(c, "99"));
  assert.ok(!matchesCustomerSearch(c, "omar"));
});

test("sorts", () => {
  const a = customer({ id: "a", name: "Zaid", createdAt: "2026-10-01T00:00:00Z" });
  const b = customer({
    id: "b",
    name: "Amal",
    createdAt: "2026-09-01T00:00:00Z",
    bookings: { total: 3, active: 0, lastAt: "2026-10-12T00:00:00Z" },
  });
  const ids = (sort: keyof typeof CUSTOMER_SORTERS) =>
    [a, b].sort(CUSTOMER_SORTERS[sort]).map((c) => c.id);
  assert.deepEqual(ids("newest"), ["a", "b"]);
  assert.deepEqual(ids("name"), ["b", "a"]);
  assert.deepEqual(ids("bookings"), ["b", "a"]);
  assert.deepEqual(ids("recent"), ["b", "a"]);
});
