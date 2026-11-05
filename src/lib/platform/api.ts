import "server-only";

import { after } from "next/server";
import type { z } from "zod";

import { jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { firstFieldErrors } from "@/lib/validation";
import { deliverPendingPushes } from "@/lib/notifications/service";
import type { DbError } from "@/lib/platform/service";

/** Parses a body against a schema, or returns the response explaining what's wrong. */
export async function parseBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ data: z.infer<Schema> } | { response: Response }> {
  const body = await readJsonBody(request);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: jsonError("validation", "Please correct the highlighted fields.", 400, {
        fieldErrors: firstFieldErrors(parsed.error),
      }),
    };
  }
  return { data: parsed.data };
}

/** Answers with what's safe to show. Anything unexpected is logged, not sent to the browser. */
export function respond(error: DbError, success: unknown = { ok: true }) {
  if (!error) return jsonOk(success);
  switch (error.code) {
    case "42501":
      return jsonError("forbidden", "You do not have permission to do this.", 403);
    case "P0002":
      return jsonError("not_found", "Not found.", 404);
    case "23505":
      return jsonError("duplicate", "That is already in use.", 409);
    case "22023":
    case "23514":
    case "23503":
      return jsonError("invalid", "That change isn't allowed.", 400);
    default:
      return jsonError(error.code ?? "db_error", error.message ?? "Database error", 500);
  }
}

/** Notifications raised by an action reach phones once the response has gone. */
export function deliverAfterResponse() {
  after(async () => {
    try {
      await deliverPendingPushes();
    } catch (error) {
      console.error("[platform] could not deliver pushes", error);
    }
  });
}

const INVITE_ERRORS: Record<string, { status: number; message: string }> = {
  email_not_configured: { status: 400, message: "Outgoing email isn't configured, so no invitation can be sent." },
  email_taken: { status: 409, message: "That email is already in use." },
  has_owner: {
    status: 409,
    message: "This dealership already has a Super Admin, who can invite their own staff.",
  },
  email_failed: { status: 502, message: "The invitation email could not be sent." },
  plan_limit: { status: 400, message: "This dealership's plan has no room for another user." },
  invite_failed: { status: 400, message: "The invitation could not be created." },
};

export function inviteError(code: string) {
  const known = INVITE_ERRORS[code] ?? INVITE_ERRORS.invite_failed;
  // 400 rather than 5xx where it's actionable, so the message reaches the person.
  return jsonError(code, known.message, known.status >= 500 ? 400 : known.status);
}
