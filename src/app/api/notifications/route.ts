import { z } from "zod";

import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import {
  clearNotifications,
  listNotifications,
  markNotificationsRead,
  maybeRunBookingDeadlineSweep,
} from "@/lib/notifications/service";

export async function GET() {
  const auth = await requireApiUser("notification.view");
  if ("response" in auth) return auth.response;

  // Every signed-in client polls this route, so it doubles as the payment-deadline trigger.
  // Awaited so a deadline that just passed shows up in this same response.
  const nextDeadlineAt = await maybeRunBookingDeadlineSweep();

  const result = await listNotifications();
  if (result.error !== null) return jsonError("db_error", result.error, 500);
  return jsonOk({
    items: result.data,
    /** Ask again right after this moment (ISO), when the next booking deadline passes. */
    nextCheckAt: nextDeadlineAt ? new Date(nextDeadlineAt).toISOString() : null,
  });
}

const markReadSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

export async function PATCH(request: Request) {
  const auth = await requireApiUser("notification.view");
  if ("response" in auth) return auth.response;

  const parsed = markReadSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);

  const error = await markNotificationsRead(auth.context.userId, "all" in parsed.data ? "all" : parsed.data.ids);
  if (error) return jsonError("db_error", error, 500);
  return jsonOk({ ok: true });
}

/** Clear all: removes every notification of the signed-in user. */
export async function DELETE() {
  const auth = await requireApiUser("notification.view");
  if ("response" in auth) return auth.response;

  const error = await clearNotifications(auth.context.userId);
  if (error) return jsonError("db_error", error, 500);
  return jsonOk({ ok: true });
}
