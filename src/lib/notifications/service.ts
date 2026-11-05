import "server-only";

import { bookingHref } from "@/lib/bookings/routes";
import { isPushConfigured, sendPushToUsers } from "@/lib/notifications/push";
import { PAYMENT_TERM_KEY_LIST, paymentTermsFromSettings } from "@/lib/settings/payment-terms";
import { platformClient, tenantClientForUser, type TenantClient } from "@/lib/server/privileged";
import { createClient } from "@/lib/supabase/server";
import { holdsDeadline } from "@/lib/bookings/cancellation-hold";
import { vehicleHref } from "@/lib/vehicles/routes";
import type { AppNotification } from "@/types/notification";

type Row = {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

/** Every active (not deleted) user in a dealership, for alerts the whole team should see. */
export async function listActiveUserIds(client: TenantClient) {
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null);
  if (error) console.error("[notifications] could not list active users", error.message);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/** Where a notification leads when opened. */
export function notificationHref(type: string, data: Record<string, unknown> | null): string {
  const stockNumber = typeof data?.stockNumber === "string" ? data.stockNumber : "";
  // Sold cars open the vehicle's inventory page, whether sold through a booking or directly.
  if (type === "vehicle_ready_for_sale" || type === "vehicle_sold" || type === "booking_sold") {
    return stockNumber ? vehicleHref(stockNumber) : "/inventory";
  }
  const number = typeof data?.bookingNumber === "string" ? data.bookingNumber : "";
  if (
    type === "booking_auto_cancelled" ||
    type === "booking_balance_overdue" ||
    type === "booking_created" ||
    type === "booking_cancelled" ||
    type === "booking_sold" ||
    type === "booking_hold_requested" ||
    type === "booking_hold_approved" ||
    type === "booking_hold_rejected"
  ) {
    return number ? bookingHref(number) : "/bookings";
  }
  return "/notifications";
}

const toNotification = (row: Row): AppNotification => ({
  id: row.id,
  type: row.type,
  title: row.title,
  message: row.message,
  entityId: row.entity_id,
  data: row.data ?? {},
  href: notificationHref(row.type, row.data),
  createdAt: row.created_at,
  read: row.is_read,
});

/** The signed-in user's latest notifications (RLS limits rows to their own). */
export async function listNotifications(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, entity_type, entity_id, data, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: error.message };
  return { data: ((data ?? []) as unknown as Row[]).map(toNotification), error: null };
}

export async function markNotificationsRead(userId: string, ids: string[] | "all") {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (ids !== "all") query = query.in("id", ids);
  const { error } = await query;
  return error ? error.message : null;
}

/**
 * Deletes all of a user's notifications ("Clear all"). Users can't delete rows under RLS,
 * so this runs with the service role, limited to the caller's own rows.
 */
export async function clearNotifications(userId: string) {
  const client = await tenantClientForUser(userId);
  const { error } = await client.from("notifications").delete().eq("user_id", userId);
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Booking payment deadlines
// ---------------------------------------------------------------------------

/**
 * Applies the payment terms from Settings: cancels bookings whose deposit didn't
 * arrive in time (freeing the cars, alerting Super Admins) and alerts the sales
 * executive and Super Admins when the full amount is overdue. Then pushes every
 * notification not delivered yet, including ones created by the pg_cron jobs.
 */
export async function runBookingDeadlineSweep() {
  const admin = platformClient();
  const deposit = await admin.rpc("cancel_unpaid_bookings");
  if (deposit.error) console.error("[bookings] deposit sweep failed", deposit.error.message);
  const balance = await admin.rpc("notify_overdue_balances");
  if (balance.error) console.error("[bookings] balance sweep failed", balance.error.message);
  await shareAutoCancelsWithSalespeople();
  const pushed = await deliverPendingPushes();
  return { cancelled: deposit.data ?? 0, balanceOverdue: balance.data ?? 0, pushed };
}

/**
 * The database only alerts Super Admins when a booking is cancelled for a missing deposit;
 * this gives the booking's sales executive the same alert. Shared rows are flagged so the
 * alert is copied once, even if someone clears their notifications.
 */
async function shareAutoCancelsWithSalespeople() {
  const admin = platformClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("notifications")
    .select("id, user_id, title, message, entity_type, entity_id, data")
    .eq("type", "booking_auto_cancelled")
    .gte("created_at", since)
    .not("entity_id", "is", null)
    .is("data->sharedWithSalesperson", null);
  const alerts = (data ?? []) as {
    id: string;
    user_id: string;
    title: string;
    message: string;
    entity_type: string | null;
    entity_id: string;
    data: Record<string, unknown> | null;
  }[];
  if (alerts.length === 0) return;

  const bookingIds = [...new Set(alerts.map((alert) => alert.entity_id))];
  const { data: bookings } = await admin
    .from("reservations")
    .select("id, salesperson_id")
    .in("id", bookingIds);
  const salespeople = new Map(
    ((bookings ?? []) as { id: string; salesperson_id: string | null }[]).map((b) => [
      b.id,
      b.salesperson_id,
    ]),
  );

  for (const bookingId of bookingIds) {
    const forBooking = alerts.filter((alert) => alert.entity_id === bookingId);
    const salespersonId = salespeople.get(bookingId);
    const { title, message, entity_type, data: payload } = forBooking[0];
    const shared = { ...payload, sharedWithSalesperson: true };
    if (salespersonId && !forBooking.some((alert) => alert.user_id === salespersonId)) {
      const { error } = await admin.from("notifications").insert({
        user_id: salespersonId,
        type: "booking_auto_cancelled",
        title,
        message,
        entity_type,
        entity_id: bookingId,
        data: shared,
      });
      if (error) {
        console.error("[bookings] could not alert the sales executive", error.message);
        continue;
      }
    }
    await Promise.all(
      forBooking.map((alert) =>
        admin
          .from("notifications")
          .update({ data: { ...alert.data, sharedWithSalesperson: true } })
          .eq("id", alert.id),
      ),
    );
  }
}

/** Pushes every notification not delivered yet (from the last 24 hours). */
export async function deliverPendingPushes() {
  // Without VAPID keys, leave notifications unclaimed so they push once keys are added.
  if (!isPushConfigured()) return 0;
  const admin = platformClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Claiming with pushed_at makes sure concurrent sweeps never push the same row twice.
  const { data } = await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .is("pushed_at", null)
    .gte("created_at", since)
    .select("id, user_id, type, title, message, data");
  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
  }[];
  const results = await Promise.all(
    rows.map((row) =>
      sendPushToUsers([row.user_id], {
        title: row.title,
        body: row.message,
        url: notificationHref(row.type, row.data),
        tag: row.id,
        // Hold requests open the booking, where the Super Admin approves or rejects.
        actions:
          row.type === "booking_hold_requested"
            ? [{ action: "review", title: "Review request" }]
            : undefined,
      }),
    ),
  );
  // Release failed deliveries so the next sweep tries again (within the 24-hour window).
  const failed = rows.filter((_, index) => !results[index]).map((row) => row.id);
  if (failed.length > 0)
    await admin.from("notifications").update({ pushed_at: null }).in("id", failed);
  return rows.length - failed.length;
}

const SWEEP_INTERVAL_MS = 30 * 1000;
let lastSweepAt = 0;
/** Earliest upcoming deadline seen at the last sweep; reaching it forces a new sweep. */
let nextDeadlineAt: number | null = null;

/**
 * The earliest deposit or full-payment deadline still ahead, so clients can check
 * again right when it passes instead of waiting for the next poll.
 */
export async function findNextBookingDeadline(): Promise<number | null> {
  const admin = platformClient();
  // Read with the service role so this also works outside a request (the background loop).
  // It spans dealerships, and each booking follows its own dealership's terms.
  const [{ data: settings }, { data }] = await Promise.all([
    admin.from("system_settings").select("tenant_id, key, value").in("key", [...PAYMENT_TERM_KEY_LIST]),
    admin
      .from("reservations")
      .select(
        "tenant_id, status, reserved_at, amount, selling_price, balance_received, balance_overdue_notified_at, cancellation_hold_status, vehicles(quantity)",
      )
      .in("status", ["active", "converted"])
      .limit(1000),
  ]);
  const settingsByTenant = new Map<string, { key: string; value: unknown }[]>();
  for (const row of (settings ?? []) as unknown as { tenant_id: string; key: string; value: unknown }[]) {
    settingsByTenant.set(row.tenant_id, [...(settingsByTenant.get(row.tenant_id) ?? []), row]);
  }
  type Row = {
    tenant_id: string;
    status: string;
    reserved_at: string;
    amount: number | string;
    selling_price: number | string | null;
    balance_received: number | string | null;
    balance_overdue_notified_at: string | null;
    cancellation_hold_status: string | null;
    vehicles: { quantity: number | null } | { quantity: number | null }[] | null;
  };
  const now = Date.now();
  let next: number | null = null;
  const consider = (at: number) => {
    if (at > now && (next === null || at < next)) next = at;
  };
  for (const row of (data ?? []) as unknown as Row[]) {
    const terms = paymentTermsFromSettings(settingsByTenant.get(row.tenant_id) ?? []);
    const bookedAt = new Date(row.reserved_at).getTime();
    const deposit = Number(row.amount);
    if (row.status === "active" && deposit <= 0 && !holdsDeadline(row.cancellation_hold_status)) {
      consider(bookedAt + terms.depositMinutes * 60_000);
    }
    if (row.balance_overdue_notified_at || row.selling_price == null) continue;
    const vehicle = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
    const total = Number(row.selling_price) * (vehicle?.quantity ?? 1);
    if (deposit + Number(row.balance_received ?? 0) < total - 0.005) {
      consider(bookedAt + terms.balanceMinutes * 60_000);
    }
  }
  return next;
}

/**
 * Runs the sweep at most every 30 seconds per server instance, or right away once a
 * known deadline has passed. Called (and awaited) from routes every signed-in client
 * polls, so a missed deadline shows up in the same response.
 * Returns the next upcoming deadline (epoch ms) for the client to schedule a re-check.
 */
export async function maybeRunBookingDeadlineSweep(): Promise<number | null> {
  const now = Date.now();
  const deadlineDue = nextDeadlineAt !== null && now >= nextDeadlineAt;
  if (now - lastSweepAt < SWEEP_INTERVAL_MS && !deadlineDue) return nextDeadlineAt;
  lastSweepAt = now;
  try {
    await runBookingDeadlineSweep();
    nextDeadlineAt = await findNextBookingDeadline();
  } catch (error) {
    console.error("[bookings] deadline sweep failed", error);
  }
  return nextDeadlineAt;
}

/** Forget the cached deadline (e.g. a booking was created or edited). */
export function invalidateBookingDeadlines() {
  nextDeadlineAt = null;
  lastSweepAt = 0;
  wakeBookingDeadlineLoop?.();
}

const LOOP_IDLE_MS = 60 * 1000;
let wakeBookingDeadlineLoop: (() => void) | null = null;

/**
 * Applies deadlines and sends pushes even when nobody has the app open: re-checks every
 * minute, and right when the next known deadline passes. Started once per Node server
 * from instrumentation.ts. Serverless hosts don't keep it alive, so there the cron route
 * (/api/cron/booking-deadlines) still needs a scheduler.
 */
export function startBookingDeadlineLoop() {
  const flag = globalThis as typeof globalThis & { __bookingDeadlineLoop?: boolean };
  if (flag.__bookingDeadlineLoop) return;
  flag.__bookingDeadlineLoop = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (next: number | null) => {
    if (timer) clearTimeout(timer);
    // Wake a second after the next deadline (or after a minute when none is close).
    const delay =
      next === null
        ? LOOP_IDLE_MS
        : Math.min(LOOP_IDLE_MS, Math.max(1000, next - Date.now() + 1000));
    timer = setTimeout(() => void tick(), delay);
    timer.unref?.();
  };
  const tick = async () => schedule(await maybeRunBookingDeadlineSweep());
  wakeBookingDeadlineLoop = () => void tick();
  console.info("[bookings] deadline loop started");
  void tick();
}
