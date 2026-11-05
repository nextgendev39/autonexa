/** The booking screen for a booking number, e.g. /bookings/BK-20261013-O1D7Z. */
export function bookingHref(number: string) {
  return `/bookings/${encodeURIComponent(number)}`;
}
