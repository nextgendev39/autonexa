import { appConfig } from "@/config/app";
import { alertBookingEvent } from "@/lib/bookings/alerts";
import { holdsDeadline, type CancellationHoldStatus } from "@/lib/bookings/cancellation-hold";
import {
  BOOKING_FILTERS,
  bookingToCollect,
  bookingUrgency,
  inBookingFilter,
  matchesBookingSearch,
  type BookingFilter,
  type BookingListPage,
  type BookingListQuery,
} from "@/lib/bookings/list-query";
import { hasPermission, type Permission } from "@/lib/permissions";
import {
  canViewAllBookings,
  isSalesExecutive as isSalesExecutiveRole,
} from "@/lib/permissions/roles";
import { currentTenantClient } from "@/lib/server/privileged";
import { getPaymentTerms } from "@/lib/settings/payment-terms";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { quantityTotal } from "@/lib/vehicles/quantity";
import { getPrimaryPhotoUrls } from "@/lib/vehicles/photos";
import { mergeReadySplitUnits, recordForUnits, undoVehicleSplit } from "@/lib/vehicles/units";
import type { BookingActionValues, CreateBookingValues } from "@/lib/validation/booking";
import { deadlineFrom, type PaymentTerms } from "@/lib/validation/payment-terms";
import type { UserContext } from "@/types/auth";
import type { VehicleBookingInfo } from "@/types/vehicle";

export type BookingStatus = "active" | "expired" | "cancelled" | "converted";

export type BookingListItem = {
  id: string;
  number: string;
  status: BookingStatus;
  deposit: number;
  /** Agreed price per unit. */
  sellingPrice: number | null;
  /** Units held by this booking (multi-unit records book several at once). */
  units: number;
  /** Selling price × units. */
  totalPrice: number | null;
  /** What the customer still owes on top of the deposit: total − deposit. */
  balanceDue: number | null;
  /** Balance paid when the booking was marked sold. */
  balanceReceived: number | null;
  soldAt: string | null;
  currency: string;
  reservedAt: string;
  /** Older bookings had a hold-until date; new ones don't expire. */
  expiresAt: string | null;
  notes: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  /** When the sales executive and Super Admins were alerted about the full payment. */
  balanceAlertedAt: string | null;
  createdBy: string | null;
  /** Cancelled by the system because no deposit arrived in time. */
  autoCancelled: boolean;
  /** Active bookings without a deposit are cancelled automatically at this time. */
  depositDueAt: string | null;
  /** When the full amount is due, while some of it is still outstanding. */
  balanceDueAt: string | null;
  /** The full-payment deadline has passed with money still outstanding. */
  balanceOverdue: boolean;
  /**
   * Deposit exception request. Pending or approved, the booking isn't auto-cancelled for a
   * missing deposit; rejected, the deadline applies again.
   */
  cancellationHold: {
    status: CancellationHoldStatus;
    reason: string | null;
    requestedBy: string | null;
    requestedAt: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
  } | null;
  /** Deposit returned when the booking was cancelled. */
  refund: {
    amount: number;
    method: string | null;
    reference: string | null;
    refundedAt: string | null;
    refundedBy: string | null;
  } | null;
  /** What the signed-in user may do with this booking (permissions + ownership). */
  can: {
    edit: boolean;
    sell: boolean;
    cancel: boolean;
    /** Ask a Super Admin to keep the booking despite no deposit (once per booking). */
    requestHold: boolean;
    /** Approve or reject a pending hold (Super Admins). */
    reviewHold: boolean;
  };
  vehicle: {
    id: string;
    stockNumber: string | null;
    title: string;
    status: string;
    /** Signed URL of the main photo; only filled on the Bookings screen's page. */
    photoUrl?: string | null;
  } | null;
  customer: { id: string; name: string; phone: string } | null;
  salesperson: { id: string; name: string } | null;
  branchId: string;
};

export type BookableVehicle = {
  id: string;
  stockNumber: string | null;
  title: string;
  branchId: string;
  /** Current selling price, used to prefill the booking's selling price. */
  sellingPrice: number | null;
  /** Units on the record; the booking can take some or all of them. */
  quantity: number;
};
export type PersonOption = {
  id: string;
  name: string;
  /** Super Admins can be a booking's sales person too; the form tags them. */
  isSuperAdmin?: boolean;
};
export type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  /** The sales executive this customer belongs to (from their first booking). */
  salesperson: PersonOption | null;
};

export type BookingError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
};
type Result<T> = { data: T; error: null } | { data: null; error: BookingError };

const fail = (code: string, message: string, fieldErrors?: Record<string, string>) => ({
  data: null,
  error: { code, message, fieldErrors },
});

function vehicleTitle(v: { year: number | null; make: string | null; model: string | null }) {
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}

type Joined<T> = T | T[] | null;
const one = <T>(value: Joined<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

// A customer's sales executive is the salesperson on their first booking.
// Read with the service role so every salesperson sees the same owner.
export async function customerOwners(customerIds?: string[]): Promise<Map<string, string>> {
  const admin = (await currentTenantClient());
  const { data } = await fetchAllRows<{ customer_id: string; salesperson_id: string }>(
    (from, to) => {
      let query = admin
        .from("reservations")
        .select("customer_id, salesperson_id, reserved_at")
        .not("salesperson_id", "is", null)
        .order("reserved_at", { ascending: true })
        .order("id", { ascending: true });
      if (customerIds) query = query.in("customer_id", customerIds);
      return query.range(from, to);
    },
  );
  const owners = new Map<string, string>();
  for (const row of data) {
    if (!owners.has(row.customer_id)) owners.set(row.customer_id, row.salesperson_id);
  }
  return owners;
}

export async function profileNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const admin = (await currentTenantClient());
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
  );
}

/** Roles a booking's sales person can have: Super Admins sell too. */
export const SALESPERSON_ROLES = ["sales_executive", "super_admin"];

/** Active users with any of the roles (by default, sales executives). */
export async function listSalesExecutives(
  roleKeys: string[] = ["sales_executive"],
): Promise<PersonOption[]> {
  const admin = (await currentTenantClient());
  const { data: roles } = await admin.from("roles").select("id, key").in("key", roleKeys);
  const roleRows = (roles ?? []) as { id: string; key: string }[];
  if (roleRows.length === 0) return [];
  const { data: links } = await admin
    .from("user_roles")
    .select("user_id, role_id")
    .in(
      "role_id",
      roleRows.map((r) => r.id),
    );
  const linkRows = (links ?? []) as { user_id: string; role_id: string }[];
  const superAdminRoleId = roleRows.find((r) => r.key === "super_admin")?.id;
  const superAdmins = new Set(
    linkRows.filter((l) => l.role_id === superAdminRoleId).map((l) => l.user_id),
  );
  const ids = [...new Set(linkRows.map((l) => l.user_id))];
  if (ids.length === 0) return [];
  const { data } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", ids)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("display_name");
  return ((data ?? []) as { id: string; display_name: string }[]).map((p) => ({
    id: p.id,
    name: p.display_name,
    ...(superAdmins.has(p.id) ? { isSuperAdmin: true } : {}),
  }));
}

const isSalesExecutive = (context: UserContext) => isSalesExecutiveRole(context.roles);

/** Everyone except Super Admins and Accountants works only with their own bookings. */
const ownBookingsOnly = (context: UserContext) => !canViewAllBookings(context.roles);

/**
 * A booking belongs to its sales executive. Booking a colleague's customer hands the booking
 * to that colleague, so whoever made it no longer sees it; the creator only owns bookings
 * without a sales executive. Mirrors the reservations RLS policies (00062).
 */
function ownBookingFilter(context: UserContext) {
  return `salesperson_id.eq.${context.userId},and(salesperson_id.is.null,created_by.eq.${context.userId})`;
}

const isOwnBooking = (
  booking: { created_by: string | null; salesperson_id: string | null },
  context: UserContext,
) =>
  booking.salesperson_id
    ? booking.salesperson_id === context.userId
    : booking.created_by === context.userId;

type Ownership = { created_by: string | null; salesperson_id: string | null };

// Sales executives may sell their own bookings even without the broader sale/status
// permissions. Other roles go by permission, and only Super Admins and Accountants may
// act on bookings that aren't theirs.
function canActOnBooking(booking: Ownership, context: UserContext, ...permissions: Permission[]) {
  const own = isOwnBooking(booking, context);
  if (isSalesExecutive(context)) return own;
  if (ownBookingsOnly(context) && !own) return false;
  return permissions.some((permission) =>
    hasPermission(context.permissions, permission, context.roles),
  );
}

/** Once a car is booked, only Super Admins may change or cancel the booking. */
const canEditBooking = (_booking: Ownership, context: UserContext) =>
  context.roles.includes("super_admin");

const canSellBooking = (booking: Ownership, context: UserContext) =>
  canActOnBooking(booking, context, "sale.create", "vehicle.status.change");

const canCancelBooking = (_booking: Ownership, context: UserContext) =>
  context.roles.includes("super_admin");

/** The booking's own sales executive (creator or assignee) asks for a cancellation hold. */
const canRequestHold = (booking: Ownership, context: UserContext) =>
  isOwnBooking(booking, context);

/** Only Super Admins approve or reject a cancellation hold. */
const canReviewHold = (context: UserContext) => context.roles.includes("super_admin");

/** Selling a ready-for-sale car straight away (no booking first). */
export const canSellDirectly = (context: UserContext) =>
  hasPermission(context.permissions, "sale.create", context.roles) ||
  hasPermission(context.permissions, "vehicle.status.change", context.roles);

const BOOKING_SELECT =
  "id, reservation_number, status, amount, selling_price, balance_received, sold_at, cancelled_at, currency, reserved_at, expires_at, notes, cancel_reason, auto_cancelled, balance_overdue_notified_at, created_by, salesperson_id, branch_id, units, cancellation_hold_status, cancellation_hold_reason, cancellation_hold_requested_by, cancellation_hold_requested_at, cancellation_hold_reviewed_by, cancellation_hold_reviewed_at, cancellation_hold_review_note, refund_amount, refund_method, refund_reference, refunded_at, refunded_by, vehicles(id, stock_number, year, make, model, status, quantity), customers(id, display_name, phone)";

type BookingRow = {
  id: string;
  reservation_number: string;
  status: BookingStatus;
  amount: number;
  selling_price: number | string | null;
  balance_received: number | string | null;
  sold_at: string | null;
  cancelled_at: string | null;
  currency: string;
  reserved_at: string;
  expires_at: string | null;
  notes: string | null;
  cancel_reason: string | null;
  balance_overdue_notified_at: string | null;
  auto_cancelled: boolean | null;
  created_by: string | null;
  salesperson_id: string | null;
  branch_id: string;
  /** Set once the booking's split units were merged back into another record. */
  units: number | null;
  cancellation_hold_status: CancellationHoldStatus | null;
  cancellation_hold_reason: string | null;
  cancellation_hold_requested_by: string | null;
  cancellation_hold_requested_at: string | null;
  cancellation_hold_reviewed_by: string | null;
  cancellation_hold_reviewed_at: string | null;
  cancellation_hold_review_note: string | null;
  refund_amount: number | string | null;
  refund_method: string | null;
  refund_reference: string | null;
  refunded_at: string | null;
  refunded_by: string | null;
  vehicles: Joined<{
    id: string;
    stock_number: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    status: string;
    quantity: number | null;
  }>;
  customers: Joined<{ id: string; display_name: string; phone: string }>;
};

/** Bookings visible to the caller, newest first; RLS enforces the same rule. */
function bookingRowsQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: UserContext,
  options: { number?: string } = {},
) {
  let query = supabase.from("reservations").select(BOOKING_SELECT);
  if (options.number) query = query.eq("reservation_number", options.number);
  if (ownBookingsOnly(context)) query = query.or(ownBookingFilter(context));
  return query.order("reserved_at", { ascending: false }).order("id", { ascending: false });
}

function toBookingItem(
  row: BookingRow,
  context: UserContext,
  terms: PaymentTerms,
  now: number,
  names: Map<string, string>,
): BookingListItem {
  const vehicle = one(row.vehicles);
  const customer = one(row.customers);
  // Active bookings past their expiry date are shown as expired.
  const status =
    row.status === "active" && row.expires_at && new Date(row.expires_at).getTime() < now
      ? "expired"
      : row.status;
  const deposit = Number(row.amount);
  const sellingPrice = row.selling_price == null ? null : Number(row.selling_price);
  const units = row.units ?? vehicle?.quantity ?? 1;
  const totalPrice = quantityTotal(sellingPrice, units);
  const balanceReceived = row.balance_received == null ? null : Number(row.balance_received);
  const outstanding = totalPrice == null ? 0 : totalPrice - deposit - (balanceReceived ?? 0);
  const balanceDueAt =
    (status === "active" || status === "converted") && outstanding > 0.005
      ? deadlineFrom(row.reserved_at, terms.balanceMinutes)
      : null;
  const holdStatus = row.cancellation_hold_status;
  const awaitingDeposit = status === "active" && deposit <= 0;
  const depositDeadline = deadlineFrom(row.reserved_at, terms.depositMinutes);
  return {
    id: row.id,
    number: row.reservation_number,
    status,
    deposit,
    sellingPrice,
    units,
    totalPrice,
    balanceDue:
      totalPrice == null ? null : Math.max(0, Math.round((totalPrice - deposit) * 100) / 100),
    balanceReceived,
    soldAt: row.sold_at,
    currency: row.currency,
    reservedAt: row.reserved_at,
    expiresAt: row.expires_at,
    notes: row.notes,
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at,
    balanceAlertedAt: row.balance_overdue_notified_at,
    createdBy: row.created_by,
    autoCancelled: row.auto_cancelled ?? false,
    // A pending or approved cancellation hold stops the deposit deadline.
    depositDueAt: awaitingDeposit && !holdsDeadline(holdStatus) ? depositDeadline : null,
    balanceDueAt,
    balanceOverdue: balanceDueAt != null && new Date(balanceDueAt).getTime() < now,
    cancellationHold: holdStatus
      ? {
          status: holdStatus,
          reason: row.cancellation_hold_reason,
          requestedBy: row.cancellation_hold_requested_by
            ? (names.get(row.cancellation_hold_requested_by) ?? null)
            : null,
          requestedAt: row.cancellation_hold_requested_at,
          reviewedBy: row.cancellation_hold_reviewed_by
            ? (names.get(row.cancellation_hold_reviewed_by) ?? null)
            : null,
          reviewedAt: row.cancellation_hold_reviewed_at,
          reviewNote: row.cancellation_hold_review_note,
        }
      : null,
    refund:
      row.refund_amount == null
        ? null
        : {
            amount: Number(row.refund_amount),
            method: row.refund_method,
            reference: row.refund_reference,
            refundedAt: row.refunded_at,
            refundedBy: row.refunded_by ? (names.get(row.refunded_by) ?? null) : null,
          },
    can: {
      edit: status === "active" && canEditBooking(row, context),
      sell: status === "active" && canSellBooking(row, context),
      cancel: status === "active" && canCancelBooking(row, context),
      requestHold:
        awaitingDeposit &&
        !holdStatus &&
        new Date(depositDeadline).getTime() > now &&
        canRequestHold(row, context),
      reviewHold: status === "active" && holdStatus === "pending" && canReviewHold(context),
    },
    vehicle: vehicle
      ? {
          id: vehicle.id,
          stockNumber: vehicle.stock_number,
          title: vehicleTitle(vehicle),
          status: vehicle.status,
        }
      : null,
    customer: customer
      ? { id: customer.id, name: customer.display_name, phone: customer.phone }
      : null,
    salesperson: row.salesperson_id
      ? { id: row.salesperson_id, name: names.get(row.salesperson_id) ?? "—" }
      : null,
    branchId: row.branch_id,
  };
}

/** Names of the sales executives and the people who asked for or reviewed a cancellation hold. */
async function salespersonNames(
  rows: Pick<
    BookingRow,
    | "salesperson_id"
    | "cancellation_hold_requested_by"
    | "cancellation_hold_reviewed_by"
    | "refunded_by"
  >[],
) {
  return profileNames([
    ...new Set(
      rows
        .flatMap((r) => [
          r.salesperson_id,
          r.cancellation_hold_requested_by,
          r.cancellation_hold_reviewed_by,
          r.refunded_by,
        ])
        .filter((id): id is string => !!id),
    ),
  ]);
}

export async function listBookings(
  context: UserContext,
  options: { number?: string } = {},
): Promise<Result<BookingListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await bookingRowsQuery(supabase, context, options).limit(500);
  if (error) return fail(error.code ?? "db_error", error.message);
  const rows = (data ?? []) as unknown as BookingRow[];
  const [names, terms] = await Promise.all([salespersonNames(rows), getPaymentTerms()]);
  const now = Date.now();
  return { data: rows.map((row) => toBookingItem(row, context, terms, now, names)), error: null };
}

/** PostgREST returns at most this many rows per request (supabase/config.toml max_rows). */
const SCAN_CHUNK = 1000;
const SCAN_LIMIT = 50_000;

/**
 * One page of the Bookings screen. Status, deadlines and amounts owed depend on the
 * payment terms, so the server derives them for every visible booking, then filters,
 * searches, counts and sorts here and returns only the requested page (salesperson
 * names are looked up for that page alone).
 */
export async function listBookingsPage(
  context: UserContext,
  query: BookingListQuery,
): Promise<Result<BookingListPage>> {
  const supabase = await createClient();
  const rows: BookingRow[] = [];
  for (let from = 0; from < SCAN_LIMIT; from += SCAN_CHUNK) {
    const { data, error } = await bookingRowsQuery(supabase, context).range(
      from,
      from + SCAN_CHUNK - 1,
    );
    if (error) return fail(error.code ?? "db_error", error.message);
    const chunk = (data ?? []) as unknown as BookingRow[];
    rows.push(...chunk);
    if (chunk.length < SCAN_CHUNK) break;
  }

  const terms = await getPaymentTerms();
  const now = Date.now();
  const noNames = new Map<string, string>();
  const all = rows.map((row) => toBookingItem(row, context, terms, now, noNames));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const counts = Object.fromEntries(
    BOOKING_FILTERS.map((key) => [key, all.filter((b) => inBookingFilter(b, key)).length]),
  ) as Record<BookingFilter, number>;
  const active = all.filter((b) => b.status === "active");
  const summary = {
    activeValue: active.reduce((sum, b) => sum + (b.totalPrice ?? 0), 0),
    noDeposit: active.filter((b) => b.depositDueAt).length,
    overdue: active.filter((b) => b.balanceOverdue).length,
    soldValue: all
      .filter((b) => b.status === "converted")
      .reduce((sum, b) => sum + (b.totalPrice ?? 0), 0),
    toCollect: active.reduce((sum, b) => sum + bookingToCollect(b), 0),
    currency: all[0]?.currency ?? appConfig.currency,
  };

  const matching = all.filter(
    (b) => inBookingFilter(b, query.filter) && matchesBookingSearch(b, query.q),
  );
  if (query.filter === "attention") matching.sort((x, y) => bookingUrgency(x) - bookingUrgency(y));

  // Past the last page (e.g. after a cancel empties it): show the last page instead.
  const pages = Math.max(1, Math.ceil(matching.length / query.pageSize));
  const page = Math.min(query.page, pages);
  const slice = matching.slice((page - 1) * query.pageSize, page * query.pageSize);
  const vehicleIds = [...new Set(slice.flatMap((b) => (b.vehicle ? [b.vehicle.id] : [])))];
  const [names, photos] = await Promise.all([
    salespersonNames(slice.map((b) => rowById.get(b.id)!)),
    getPrimaryPhotoUrls(vehicleIds),
  ]);
  // Rebuilt with names so the salesperson and the hold's requester and reviewer are filled in.
  const items = slice.map((b) => {
    const item = toBookingItem(rowById.get(b.id)!, context, terms, now, names);
    return {
      ...item,
      vehicle: item.vehicle
        ? { ...item.vehicle, photoUrl: photos.get(item.vehicle.id) ?? null }
        : null,
    };
  });

  return {
    data: { items, total: matching.length, page, pageSize: query.pageSize, counts, summary },
    error: null,
  };
}

export async function listBookingOptions(context: UserContext): Promise<
  Result<{
    vehicles: BookableVehicle[];
    customers: CustomerOption[];
    salesExecutives: PersonOption[];
    /** Set when the caller is a sales executive: new customers are always theirs. */
    selfSalespersonId: string | null;
    paymentTerms: PaymentTerms;
  }>
> {
  const supabase = await createClient();
  const [vehicles, customers] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, stock_number, year, make, model, branch_id, current_selling_price, quantity")
      .eq("status", "ready_for_sale")
      .eq("has_minimum_price", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("customers")
      .select("id, display_name, phone")
      .is("deleted_at", null)
      .order("display_name")
      .limit(1000),
  ]);
  if (vehicles.error) return fail(vehicles.error.code ?? "db_error", vehicles.error.message);

  type V = {
    id: string;
    stock_number: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    branch_id: string;
    current_selling_price: number | string | null;
    quantity: number | null;
  };
  type C = { id: string; display_name: string; phone: string };
  const customerRows = (customers.data ?? []) as C[];
  const [owners, salesExecutives] = await Promise.all([
    customerOwners(customerRows.map((c) => c.id)),
    listSalesExecutives(SALESPERSON_ROLES),
  ]);
  const ownerNames = await profileNames([...new Set(owners.values())]);
  return {
    data: {
      vehicles: ((vehicles.data ?? []) as V[]).map((v) => ({
        id: v.id,
        stockNumber: v.stock_number,
        title: vehicleTitle(v),
        branchId: v.branch_id,
        sellingPrice: v.current_selling_price == null ? null : Number(v.current_selling_price),
        quantity: v.quantity ?? 1,
      })),
      customers: customerRows.map((c) => {
        const ownerId = owners.get(c.id);
        return {
          id: c.id,
          name: c.display_name,
          phone: c.phone,
          salesperson: ownerId ? { id: ownerId, name: ownerNames.get(ownerId) ?? "—" } : null,
        };
      }),
      salesExecutives,
      selfSalespersonId: isSalesExecutive(context) ? context.userId : null,
      paymentTerms: await getPaymentTerms(),
    },
    error: null,
  };
}

function code(prefix: string) {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// Vehicle status is changed with the service role: booking staff may hold
// reservation permissions without vehicle.status.change. Callers check permissions first.
async function setVehicleStatus(vehicleId: string, from: string, to: string, userId: string) {
  const admin = (await currentTenantClient());
  const { data, error } = await admin
    .from("vehicles")
    .update({ status: to, updated_by: userId })
    .eq("id", vehicleId)
    .eq("status", from)
    .select("id");
  return !error && (data?.length ?? 0) === 1;
}

// The minimum is hidden from sales roles, so it's read with the service role and
// only the pass/fail result is returned.
async function checkMinimumPrice(vehicleId: string, sellingPrice: number) {
  const { data } = await (await currentTenantClient())
    .from("vehicles")
    .select("minimum_selling_price")
    .eq("id", vehicleId)
    .maybeSingle();
  const minimum = Number(
    (data as { minimum_selling_price: number | string | null } | null)?.minimum_selling_price ?? 0,
  );
  if (sellingPrice >= minimum) return null;
  return fail("below_minimum", "The selling price is below the minimum allowed for this car.", {
    sellingPrice: "bookings.errors.belowMinimum",
  });
}

/**
 * Books a ready-for-sale car for a customer. With `sell`, the car is sold on the spot
 * instead: the booking is recorded as already sold with the full price received, and
 * the car moves straight to Sold.
 */
export async function createBooking(
  values: CreateBookingValues,
  context: UserContext,
): Promise<Result<{ id: string; assignedTo: string | null }>> {
  const sell = values.sell === true;
  if (
    sell
      ? !canSellDirectly(context)
      : !hasPermission(context.permissions, "reservation.create", context.roles)
  ) {
    return fail(
      "forbidden",
      sell
        ? "You do not have permission to sell cars."
        : "You do not have permission to create bookings.",
    );
  }

  const supabase = await createClient();
  const { data: vehicleRow } = await supabase
    .from("vehicles")
    .select("id, status, branch_id, has_minimum_price, quantity")
    .eq("id", values.vehicleId)
    .is("deleted_at", null)
    .maybeSingle();
  const vehicle = vehicleRow as {
    id: string;
    status: string;
    branch_id: string;
    has_minimum_price: boolean | null;
    quantity: number | null;
  } | null;
  if (!vehicle)
    return fail("not_found", "Vehicle not found.", {
      vehicleId: "bookings.errors.vehicleNotFound",
    });
  if (vehicle.status !== "ready_for_sale") {
    return fail("not_available", "Vehicle is not ready for sale.", {
      vehicleId: "bookings.errors.notAvailable",
    });
  }
  const units = vehicle.quantity ?? 1;
  if (values.quantity != null && values.quantity > units) {
    return fail("validation", `Only ${units} units are available.`, {
      quantity: "bookings.errors.tooManyUnits",
    });
  }
  if (!vehicle.has_minimum_price) {
    return fail("no_minimum_price", "Set a minimum selling price before booking this car.", {
      vehicleId: "bookings.errors.noMinimumPrice",
    });
  }

  const belowMinimum = await checkMinimumPrice(vehicle.id, values.sellingPrice);
  if (belowMinimum) return belowMinimum;

  let customerId = values.customerId ?? null;
  let createdCustomerId: string | null = null;
  let salespersonId: string | null = null;
  const salesExecutives = await listSalesExecutives(SALESPERSON_ROLES);
  const isValidSalesExecutive = (id: string | null | undefined) =>
    !!id && salesExecutives.some((p) => p.id === id);

  if (values.customerMode === "existing") {
    // Read through the session: the ID came from the browser, and a customer of a branch the
    // caller can't see must not be reachable by naming it.
    const { data: visibleCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId!)
      .is("deleted_at", null)
      .maybeSingle();
    if (!visibleCustomer) {
      return fail("not_found", "Customer not found.", {
        customerId: "bookings.errors.customerNotFound",
      });
    }
    // Existing customers always stay with the sales executive from their first booking.
    salespersonId = (await customerOwners([customerId!])).get(customerId!) ?? null;
  } else {
    if (!hasPermission(context.permissions, "customer.create", context.roles)) {
      return fail("forbidden", "You do not have permission to add customers.");
    }
    const { data: existing } = await (await currentTenantClient())
      .from("customers")
      .select("id, display_name")
      .eq("phone", values.phone!)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      return fail("customer_exists", "A customer with this phone number already exists.", {
        phone: "bookings.errors.customerExists",
      });
    }
  }

  if (!salespersonId) {
    salespersonId = isSalesExecutive(context) ? context.userId : (values.salespersonId ?? null);
    if (!isValidSalesExecutive(salespersonId)) {
      return fail("validation", "Choose the sales executive for this customer.", {
        salespersonId: "bookings.errors.salespersonRequired",
      });
    }
  }

  if (values.customerMode === "new") {
    const firstName = values.firstName!.trim();
    const lastName = values.lastName!.trim();
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        customer_code: code("CUS"),
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName}`,
        phone: values.phone!,
        branch_id: vehicle.branch_id,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error?.code === "23505") {
      return fail("customer_exists", "A customer with this phone number already exists.", {
        phone: "bookings.errors.customerExists",
      });
    }
    if (error || !customer)
      return fail("customer_failed", error?.message ?? "Could not add the customer.");
    customerId = (customer as { id: string }).id;
    createdCustomerId = customerId;
  }

  const admin = (await currentTenantClient());
  // Booking some of a multi-unit record moves those units to their own record first.
  const target = await recordForUnits(
    { id: vehicle.id, quantity: units },
    values.quantity,
    context.userId,
  );
  if (target.error !== null) {
    if (createdCustomerId) await admin.from("customers").delete().eq("id", createdCustomerId);
    return fail("split_failed", target.error);
  }
  // Removes a customer created for this booking and puts split units back.
  const rollback = async () => {
    if (createdCustomerId) await admin.from("customers").delete().eq("id", createdCustomerId);
    if (target.split) await undoVehicleSplit(target.id);
  };

  // A direct sale is paid in full: no deposit, the whole price received on completion.
  // It's written with the service role since sellers may not hold reservation.create.
  const soldUnits = values.quantity ?? units;
  const sale = sell
    ? {
        amount: 0,
        status: "converted" as const,
        balance_received: quantityTotal(values.sellingPrice, soldUnits) ?? 0,
        sold_at: new Date().toISOString(),
        sold_by: context.userId,
      }
    : { amount: values.deposit };
  // The id is made here rather than read back: when the customer belongs to another sales
  // executive, the booking is theirs and RLS no longer lets the creator select it.
  const booking = { id: crypto.randomUUID() };
  const { error: bookingError } = await (sell ? admin : supabase)
    .from("reservations")
    .insert({
      id: booking.id,
      reservation_number: code("BK"),
      vehicle_id: target.id,
      customer_id: customerId,
      salesperson_id: salespersonId,
      branch_id: vehicle.branch_id,
      selling_price: values.sellingPrice,
      expires_at: null,
      notes: values.notes || null,
      created_by: context.userId,
      ...sale,
    });

  if (bookingError) {
    await rollback();
    // DB trigger backstop (e.g. minimum price removed after the check above).
    if (bookingError?.message?.includes("minimum selling price not set")) {
      return fail("no_minimum_price", "Set a minimum selling price before booking this car.", {
        vehicleId: "bookings.errors.noMinimumPrice",
      });
    }
    if (bookingError?.code === "23505") {
      return fail("already_booked", "This vehicle already has an active booking.", {
        vehicleId: "bookings.errors.alreadyBooked",
      });
    }
    return fail("booking_failed", bookingError?.message ?? "Could not create the booking.");
  }

  if (
    !(await setVehicleStatus(
      target.id,
      "ready_for_sale",
      sell ? "sold" : "reserved",
      context.userId,
    ))
  ) {
    await admin.from("reservations").delete().eq("id", booking.id);
    await rollback();
    return fail("not_available", "Vehicle status changed. Try again.", {
      vehicleId: "bookings.errors.notAvailable",
    });
  }

  alertBookingEvent(sell ? "sold" : "created", booking.id, context.userId);
  // Booked for a colleague's customer: tell the creator whose bookings it went to.
  const assignedTo =
    ownBookingsOnly(context) && salespersonId !== context.userId
      ? (salesExecutives.find((p) => p.id === salespersonId)?.name ?? null)
      : null;
  return { data: { id: booking.id, assignedTo }, error: null };
}

export async function updateBooking(
  id: string,
  action: Extract<BookingActionValues, { action: "cancel" | "sold" }>,
  context: UserContext,
): Promise<Result<true>> {
  const supabase = await createClient();
  const { data: bookingRow } = await supabase
    .from("reservations")
    .select(
      "id, status, vehicle_id, created_by, salesperson_id, amount, selling_price, vehicles(quantity)",
    )
    .eq("id", id)
    .maybeSingle();
  const booking = bookingRow as unknown as {
    id: string;
    status: string;
    vehicle_id: string;
    created_by: string | null;
    salesperson_id: string | null;
    amount: number | string;
    selling_price: number | string | null;
    vehicles: Joined<{ quantity: number | null }>;
  } | null;
  if (!booking) return fail("not_found", "Booking not found.");
  const allowed =
    action.action === "cancel"
      ? canCancelBooking(booking, context)
      : canSellBooking(booking, context);
  if (!allowed) {
    return fail(
      "forbidden",
      action.action === "cancel"
        ? "Only a Super Admin can cancel a booking."
        : ownBookingsOnly(context)
          ? "You can only manage your own bookings."
          : "You do not have permission for this action.",
    );
  }
  if (booking.status !== "active") return fail("not_active", "This booking is no longer active.");

  // A received deposit must be settled when cancelling: how much goes back, and how.
  const deposit = Number(booking.amount);
  const refund = action.action === "cancel" ? action.refund : undefined;
  if (action.action === "cancel" && deposit > 0) {
    if (!refund) {
      return fail("refund_required", "Record the deposit refund before cancelling.", {
        "refund.amount": "bookings.cancelDialog.refundRequired",
      });
    }
    if (refund.amount > deposit) {
      return fail("refund_too_high", "The refund can't be more than the deposit received.", {
        "refund.amount": "bookings.cancelDialog.refundTooHigh",
      });
    }
  }

  // Selling records the full balance as received (deposit + balance = total price).
  const total = quantityTotal(
    booking.selling_price == null ? null : Number(booking.selling_price),
    one(booking.vehicles)?.quantity,
  );
  const fullBalance =
    total == null ? 0 : Math.max(0, Math.round((total - Number(booking.amount)) * 100) / 100);

  const patch =
    action.action === "cancel"
      ? {
          status: "cancelled" as const,
          cancelled_at: new Date().toISOString(),
          cancel_reason: action.reason || null,
          ...(refund && deposit > 0
            ? {
                refund_amount: Math.round(refund.amount * 100) / 100,
                refund_method: refund.method,
                refund_reference: refund.reference || null,
                refunded_at: new Date().toISOString(),
                refunded_by: context.userId,
              }
            : {}),
        }
      : {
          status: "converted" as const,
          balance_received: fullBalance,
          sold_at: new Date().toISOString(),
          sold_by: context.userId,
        };

  // Booking first: a sold vehicle can't move back to booked, but a booking can be re-activated.
  // Refund columns are server-only (guard trigger), so cancelling writes with the service role
  // once the Super Admin check above has passed.
  const writer = action.action === "cancel" ? (await currentTenantClient()) : supabase;
  const { error } = await writer
    .from("reservations")
    .update(patch)
    .eq("id", id)
    .eq("status", "active");
  if (error) return fail(error.code ?? "db_error", error.message);

  const nextVehicleStatus = action.action === "cancel" ? "ready_for_sale" : "sold";
  if (
    !(await setVehicleStatus(booking.vehicle_id, "reserved", nextVehicleStatus, context.userId))
  ) {
    await (await currentTenantClient())
      .from("reservations")
      .update({
        status: "active",
        cancelled_at: null,
        cancel_reason: null,
        balance_received: null,
        sold_at: null,
        sold_by: null,
        refund_amount: null,
        refund_method: null,
        refund_reference: null,
        refunded_at: null,
        refunded_by: null,
      })
      .eq("id", id);
    return fail("vehicle_state", "The vehicle is no longer booked.");
  }
  // Units split off for this booking rejoin the Ready for sale record they came from.
  if (action.action === "cancel") await mergeReadySplitUnits(booking.vehicle_id);
  alertBookingEvent(action.action === "cancel" ? "cancelled" : "sold", id, context.userId);
  return { data: true, error: null };
}

type HoldRow = Ownership & {
  id: string;
  status: string;
  amount: number | string;
  reserved_at: string;
  cancellation_hold_status: CancellationHoldStatus | null;
};

/** The booking as the caller may see it (RLS applies), with its cancellation hold. */
async function loadHoldBooking(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, status, amount, reserved_at, created_by, salesperson_id, cancellation_hold_status")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as HoldRow | null;
}

const holdTaken = (status: CancellationHoldStatus | null) =>
  status === "approved"
    ? fail("hold_approved", "A cancellation hold was already approved for this booking.")
    : status === "rejected"
      ? fail("hold_rejected", "The cancellation hold for this booking was already rejected.")
      : fail("hold_pending", "A cancellation hold request is already waiting for review.");

/**
 * No deposit yet: the booking's sales executive asks the Super Admins to keep it from
 * being auto-cancelled. One request per booking; the deadline pauses while it's reviewed.
 */
export async function requestCancellationHold(
  id: string,
  reason: string,
  context: UserContext,
): Promise<Result<true>> {
  const booking = await loadHoldBooking(id);
  if (!booking) return fail("not_found", "Booking not found.");
  if (!canRequestHold(booking, context)) {
    return fail("forbidden", "Only the booking's sales executive can request a cancellation hold.");
  }
  if (booking.status !== "active") return fail("not_active", "This booking is no longer active.");
  if (Number(booking.amount) > 0) {
    return fail("deposit_received", "The deposit was already received for this booking.");
  }
  if (booking.cancellation_hold_status) return holdTaken(booking.cancellation_hold_status);
  const terms = await getPaymentTerms();
  if (new Date(deadlineFrom(booking.reserved_at, terms.depositMinutes)).getTime() <= Date.now()) {
    return fail("deadline_passed", "The deposit deadline has already passed.");
  }

  // Conditional update: only one request ever moves the hold from none to pending, so a
  // double click or two tabs can't send the request (or its alerts) twice.
  const admin = (await currentTenantClient());
  const { data, error } = await admin
    .from("reservations")
    .update({
      cancellation_hold_status: "pending",
      cancellation_hold_reason: reason,
      cancellation_hold_requested_by: context.userId,
      cancellation_hold_requested_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "active")
    .lte("amount", 0)
    .is("cancellation_hold_status", null)
    .select("id");
  if (error) return fail(error.code ?? "db_error", error.message);
  if (!data || data.length === 0) {
    const latest = await loadHoldBooking(id);
    if (latest?.status !== "active") return fail("not_active", "This booking is no longer active.");
    return holdTaken(latest.cancellation_hold_status ?? "pending");
  }

  alertBookingEvent("hold_requested", id, context.userId);
  return { data: true, error: null };
}

/**
 * A Super Admin approves (the booking stays active and won't auto-cancel) or rejects (the
 * normal deposit deadline applies again) a pending cancellation hold.
 */
export async function reviewCancellationHold(
  id: string,
  decision: "approve" | "reject",
  note: string | undefined,
  context: UserContext,
): Promise<Result<true>> {
  if (!canReviewHold(context)) {
    return fail("forbidden", "Only a Super Admin can review a cancellation hold.");
  }
  const booking = await loadHoldBooking(id);
  if (!booking) return fail("not_found", "Booking not found.");
  if (booking.status !== "active") return fail("not_active", "This booking is no longer active.");
  if (booking.cancellation_hold_status !== "pending") {
    return booking.cancellation_hold_status
      ? holdTaken(booking.cancellation_hold_status)
      : fail("no_request", "There is no cancellation hold request to review.");
  }

  const admin = (await currentTenantClient());
  const { data, error } = await admin
    .from("reservations")
    .update({
      cancellation_hold_status: decision === "approve" ? "approved" : "rejected",
      cancellation_hold_reviewed_by: context.userId,
      cancellation_hold_reviewed_at: new Date().toISOString(),
      cancellation_hold_review_note: note || null,
    })
    .eq("id", id)
    .eq("status", "active")
    .eq("cancellation_hold_status", "pending")
    .select("id");
  if (error) return fail(error.code ?? "db_error", error.message);
  if (!data || data.length === 0) {
    const latest = await loadHoldBooking(id);
    if (latest?.status !== "active") return fail("not_active", "This booking is no longer active.");
    return holdTaken(latest.cancellation_hold_status);
  }

  alertBookingEvent(decision === "approve" ? "hold_approved" : "hold_rejected", id, context.userId);
  return { data: true, error: null };
}

export async function editBooking(
  id: string,
  values: { deposit: number; sellingPrice: number; notes?: string },
  context: UserContext,
): Promise<Result<true>> {
  const supabase = await createClient();
  const { data: bookingRow } = await supabase
    .from("reservations")
    .select("id, status, vehicle_id, created_by, salesperson_id")
    .eq("id", id)
    .maybeSingle();
  const booking = bookingRow as
    ({ id: string; status: string; vehicle_id: string } & Ownership) | null;
  if (!booking) return fail("not_found", "Booking not found.");
  if (!canEditBooking(booking, context)) {
    return fail("forbidden", "Only a Super Admin can edit a booking.");
  }
  if (booking.status !== "active") return fail("not_active", "This booking is no longer active.");

  const belowMinimum = await checkMinimumPrice(booking.vehicle_id, values.sellingPrice);
  if (belowMinimum) return belowMinimum;

  const { data, error } = await supabase
    .from("reservations")
    .update({
      amount: values.deposit,
      selling_price: values.sellingPrice,
      notes: values.notes || null,
    })
    .eq("id", id)
    .eq("status", "active")
    .select("id");
  if (error) return fail(error.code ?? "db_error", error.message);
  if ((data?.length ?? 0) === 0) return fail("not_active", "This booking is no longer active.");
  return { data: true, error: null };
}

/**
 * The current (or, once sold, the converted) booking for a vehicle, for the people who
 * may see it: its sales person, Accountants and Super Admins. RLS enforces the same rule.
 */
export async function getVehicleBooking(
  vehicleId: string,
  context: UserContext,
): Promise<VehicleBookingInfo | null> {
  if (!hasPermission(context.permissions, "reservation.view", context.roles)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("reservations")
    .select(
      "id, reservation_number, status, amount, selling_price, balance_received, sold_at, currency, reserved_at, notes, created_by, salesperson_id, customers(display_name, phone)",
    )
    .eq("vehicle_id", vehicleId)
    .in("status", ["active", "converted"])
    .order("reserved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type Row = Ownership & {
    id: string;
    reservation_number: string;
    status: BookingStatus;
    amount: number | string;
    selling_price: number | string | null;
    balance_received: number | string | null;
    sold_at: string | null;
    currency: string;
    reserved_at: string;
    notes: string | null;
    customers: Joined<{ display_name: string; phone: string }>;
  };
  const row = data as unknown as Row | null;
  if (!row) return null;
  if (ownBookingsOnly(context) && !isOwnBooking(row, context)) return null;

  const names = await profileNames(
    [row.salesperson_id, row.created_by].filter((id): id is string => Boolean(id)),
  );
  const customer = one(row.customers);
  return {
    id: row.id,
    number: row.reservation_number,
    status: row.status,
    deposit: Number(row.amount),
    sellingPrice: row.selling_price == null ? null : Number(row.selling_price),
    balanceReceived: row.balance_received == null ? null : Number(row.balance_received),
    soldAt: row.sold_at,
    currency: row.currency,
    reservedAt: row.reserved_at,
    notes: row.notes,
    customer: customer ? { name: customer.display_name, phone: customer.phone } : null,
    salesperson: row.salesperson_id ? (names.get(row.salesperson_id) ?? null) : null,
    // Only when someone else booked it for the sales executive.
    bookedBy:
      row.created_by && row.created_by !== row.salesperson_id
        ? (names.get(row.created_by) ?? null)
        : null,
  };
}

export type BookingDetail = BookingListItem & {
  vehiclePhotoUrl: string | null;
  bookedBy: string | null;
  paymentTerms: PaymentTerms;
};

/** One booking (by its number) with what the booking screen shows. Same visibility rules as the list. */
export async function getBookingDetail(
  number: string,
  context: UserContext,
): Promise<Result<BookingDetail | null>> {
  const [list, terms] = await Promise.all([listBookings(context, { number }), getPaymentTerms()]);
  if (list.error) return list;
  const booking = list.data[0];
  if (!booking) return { data: null, error: null };
  const [photos, names] = await Promise.all([
    booking.vehicle
      ? getPrimaryPhotoUrls([booking.vehicle.id])
      : Promise.resolve(new Map<string, string | null>()),
    profileNames(booking.createdBy ? [booking.createdBy] : []),
  ]);
  return {
    data: {
      ...booking,
      vehiclePhotoUrl: booking.vehicle ? (photos.get(booking.vehicle.id) ?? null) : null,
      bookedBy: booking.createdBy ? (names.get(booking.createdBy) ?? null) : null,
      paymentTerms: terms,
    },
    error: null,
  };
}
