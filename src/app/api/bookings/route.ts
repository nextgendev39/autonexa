import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { readBookingListQuery } from "@/lib/bookings/list-query";
import { createBooking, listBookingsPage } from "@/lib/bookings/service";
import { invalidateBookingDeadlines, maybeRunBookingDeadlineSweep } from "@/lib/notifications/service";
import { firstFieldErrors } from "@/lib/validation";
import { createBookingSchema } from "@/lib/validation/booking";

/** One page of bookings: ?filter=active|attention|sold|closed|all&q=&page=1&pageSize=25 */
export async function GET(request: Request) {
  const auth = await requireApiUser("reservation.view");
  if ("response" in auth) return auth.response;
  // Apply any deadline that just passed so the list is current.
  await maybeRunBookingDeadlineSweep();
  const query = readBookingListQuery(new URL(request.url).searchParams);
  const result = await listBookingsPage(auth.context, query);
  if (result.error) return jsonError(result.error.code, result.error.message, 400);
  return jsonOk(result.data);
}

export async function POST(request: Request) {
  // Booking needs reservation.create, selling straight away sale rights; the service checks which.
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Invalid booking.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await createBooking(parsed.data, auth.context);
  if (result.error) {
    const status = result.error.code === "forbidden" ? 403 : 400;
    return jsonError(result.error.code, result.error.message, status, {
      fieldErrors: result.error.fieldErrors,
    });
  }
  invalidateBookingDeadlines();
  return jsonOk(result.data, { status: 201 });
}
