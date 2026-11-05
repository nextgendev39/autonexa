import "server-only";

import { after } from "next/server";

import { deliverPendingPushes, listActiveUserIds } from "@/lib/notifications/service";
import { tenantClientForUser } from "@/lib/server/privileged";

export const BOOKING_CREATED = "booking_created";
export const BOOKING_CANCELLED = "booking_cancelled";
export const BOOKING_SOLD = "booking_sold";
export const BOOKING_HOLD_REQUESTED = "booking_hold_requested";
export const BOOKING_HOLD_APPROVED = "booking_hold_approved";
export const BOOKING_HOLD_REJECTED = "booking_hold_rejected";

export type BookingEvent =
  | "created"
  | "cancelled"
  | "sold"
  | "hold_requested"
  | "hold_approved"
  | "hold_rejected";

const TYPES: Record<BookingEvent, string> = {
  created: BOOKING_CREATED,
  cancelled: BOOKING_CANCELLED,
  sold: BOOKING_SOLD,
  hold_requested: BOOKING_HOLD_REQUESTED,
  hold_approved: BOOKING_HOLD_APPROVED,
  hold_rejected: BOOKING_HOLD_REJECTED,
};

type Joined<T> = T | T[] | null;
const one = <T>(value: Joined<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

/**
 * Tells every active Super Admin and the booking's sales executive (except whoever acted)
 * that a booking was created, cancelled or sold, in-app and by push. A sale reaches every
 * active user, including whoever sold it, on every browser they subscribed from. A cancellation
 * hold request goes to every active Super Admin; the decision goes back to whoever asked and
 * the sales executive. Runs after the response so the booking isn't held up.
 */
export function alertBookingEvent(kind: BookingEvent, bookingId: string, actorId: string) {
  after(async () => {
    try {
      await createBookingAlert(kind, bookingId, actorId);
      await deliverPendingPushes();
    } catch (error) {
      console.error("[bookings] booking alert failed", error);
    }
  });
}

async function createBookingAlert(kind: BookingEvent, bookingId: string, actorId: string) {
  // Runs after the response: the dealership comes from the person who acted.
  const admin = await tenantClientForUser(actorId);
  const [{ data: adminIds }, { data: bookingRow }, { data: actorRow }] = await Promise.all([
    admin.rpc("active_super_admin_ids" as never, { p_tenant_id: admin.tenantId } as never),
    admin
      .from("reservations")
      .select(
        "branch_id, reservation_number, salesperson_id, selling_price, amount, currency, units, cancel_reason, vehicle_id, cancellation_hold_reason, cancellation_hold_requested_by, cancellation_hold_review_note, vehicles(stock_number, year, make, model, quantity), customers(display_name)",
      )
      .eq("id", bookingId)
      .maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", actorId).maybeSingle(),
  ]);

  const booking = bookingRow as unknown as {
    branch_id: string;
    reservation_number: string;
    salesperson_id: string | null;
    selling_price: number | string | null;
    amount: number | string;
    currency: string;
    units: number | null;
    cancel_reason: string | null;
    vehicle_id: string;
    cancellation_hold_reason: string | null;
    cancellation_hold_requested_by: string | null;
    cancellation_hold_review_note: string | null;
    vehicles: Joined<{
      stock_number: string | null;
      year: number | null;
      make: string | null;
      model: string | null;
      quantity: number | null;
    }>;
    customers: Joined<{ display_name: string }>;
  } | null;
  if (!booking) return;

  const superAdmins = (adminIds ?? []) as unknown as string[];
  // A sale goes out to every active user, the seller included. A hold request goes to every
  // Super Admin, and its decision to whoever asked and the sales executive. Other booking
  // events stay with admins and the sales executive, minus whoever acted.
  const recipients =
    kind === "sold"
      ? await listActiveUserIds(admin, booking.branch_id)
      : kind === "hold_requested"
        ? superAdmins
        : kind === "hold_approved" || kind === "hold_rejected"
          ? [
              ...new Set(
                [booking.cancellation_hold_requested_by, booking.salesperson_id].filter(
                  (id): id is string => Boolean(id),
                ),
              ),
            ]
          : [
              ...new Set([
                ...superAdmins,
                ...(booking.salesperson_id ? [booking.salesperson_id] : []),
              ]),
            ].filter((id) => id !== actorId);

  const vehicle = one(booking.vehicles);
  const { data: salesRow } = booking.salesperson_id
    ? await admin
        .from("profiles")
        .select("display_name")
        .eq("id", booking.salesperson_id)
        .maybeSingle()
    : { data: null };
  const actorName = (actorRow as { display_name: string } | null)?.display_name ?? null;
  const vehicleTitle =
    [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || null;
  const label = vehicleTitle || vehicle?.stock_number || "vehicle";
  const number = booking.reservation_number;
  const by = actorName ? ` by ${actorName}` : "";
  const customer = one(booking.customers)?.display_name ?? null;
  const forCustomer = customer ? ` for ${customer}` : "";

  const holdReason = booking.cancellation_hold_reason;
  const reviewNote = booking.cancellation_hold_review_note;
  const titles: Record<BookingEvent, string> = {
    created: "New booking",
    sold: "Car sold",
    cancelled: "Booking cancelled",
    hold_requested: "Request to keep a booking",
    hold_approved: "Booking kept without a deposit",
    hold_rejected: "Request to keep a booking not approved",
  };
  const messages: Record<BookingEvent, string> = {
    created: `Booking ${number} for ${label} was created${by}${forCustomer}.`,
    sold: `${label} (${number}) was sold${by}${forCustomer}.`,
    cancelled: `Booking ${number} for ${label} was cancelled${by}.${booking.cancel_reason ? ` Reason: ${booking.cancel_reason}` : ""}`,
    hold_requested: `${actorName ?? "A sales executive"} asks to keep booking ${number} (${label}${forCustomer}) active without a deposit. Review the request.${holdReason ? ` Reason: ${holdReason}` : ""}`,
    hold_approved: `Booking ${number} (${label}) will not be cancelled for a missing deposit. Approved${by}.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
    hold_rejected: `Keeping booking ${number} (${label}) without a deposit was not approved${by}. The deposit deadline applies again.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
  };
  const title = titles[kind];
  const message = messages[kind];

  const data = {
    bookingNumber: number,
    vehicleId: booking.vehicle_id,
    vehicleTitle,
    stockNumber: vehicle?.stock_number ?? null,
    customerName: customer,
    salespersonName: (salesRow as { display_name: string } | null)?.display_name ?? null,
    actorName,
    units: booking.units ?? vehicle?.quantity ?? 1,
    sellingPrice: booking.selling_price == null ? null : Number(booking.selling_price),
    deposit: Number(booking.amount),
    currency: booking.currency,
    reason: kind === "hold_requested" ? holdReason : booking.cancel_reason,
    note: reviewNote,
  };
  if (recipients.length > 0) {
    const { error } = await admin.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        type: TYPES[kind],
        title,
        message,
        entity_type: "reservation",
        entity_id: bookingId,
        data,
      })),
    );
    if (error) console.error("[bookings] could not save booking alert", error.message);
  }
}
