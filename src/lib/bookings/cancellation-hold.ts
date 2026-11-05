/** Deposit exception on a booking: null (none), or the state of the Super Admin request. */
export type CancellationHoldStatus = "pending" | "approved" | "rejected";

/**
 * A pending or approved hold stops the deposit deadline from cancelling the booking
 * (mirrors public.cancel_unpaid_bookings). A rejected one lets it apply again.
 */
export function holdsDeadline(status: string | null | undefined) {
  return status === "pending" || status === "approved";
}
