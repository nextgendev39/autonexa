import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import {
  editBooking,
  requestCancellationHold,
  reviewCancellationHold,
  updateBooking,
} from "@/lib/bookings/service";
import { invalidateBookingDeadlines } from "@/lib/notifications/service";
import { firstFieldErrors } from "@/lib/validation";
import { bookingActionSchema } from "@/lib/validation/booking";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("reservation.view");
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const parsed = bookingActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("validation", "Invalid action.", 400, { fieldErrors: firstFieldErrors(parsed.error) });
  }

  const { data: action } = parsed;
  const result =
    action.action === "edit"
      ? await editBooking(id, action, auth.context)
      : action.action === "request_hold"
        ? await requestCancellationHold(id, action.reason, auth.context)
        : action.action === "review_hold"
          ? await reviewCancellationHold(id, action.decision, action.note, auth.context)
          : await updateBooking(id, action, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code.startsWith("hold_")
          ? 409
          : 400;
    return jsonError(result.error.code, result.error.message, status, {
      fieldErrors: result.error.fieldErrors,
    });
  }
  invalidateBookingDeadlines();
  return jsonOk({ ok: true });
}
