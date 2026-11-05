import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { UserContext } from "@/types/auth";

export type ApiErrorBody = {
  status: "error";
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
};

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ status: "success", data }, { ...init, status: init?.status ?? 200 });
}

export function jsonError(
  error: string,
  message: string,
  status: number,
  extras?: { fieldErrors?: Record<string, string>; details?: unknown },
) {
  // Server errors carry raw database/driver text: log it, never send it to the browser.
  const serverError = status >= 500;
  if (serverError) console.error(`[api] ${error}: ${message}`, extras?.details ?? "");
  const body: ApiErrorBody = {
    status: "error",
    error,
    message: serverError ? "Something went wrong. Please try again." : message,
    ...(extras?.fieldErrors ? { fieldErrors: extras.fieldErrors } : {}),
    ...(!serverError && extras?.details !== undefined ? { details: extras.details } : {}),
  };
  return NextResponse.json(body, { status });
}

export async function requireApiUser(
  permission?: Permission,
): Promise<{ context: UserContext } | { response: NextResponse }> {
  const context = await getUserContext();

  if (!context || context.status === "SUSPENDED" || context.status === "DISABLED") {
    return {
      response: jsonError("unauthorized", "Authentication required.", 401),
    };
  }

  if (context.status === "INVITED") {
    return {
      response: jsonError("invitation_required", "Accept invitation first.", 403),
    };
  }

  if (permission && !hasPermission(context.permissions, permission, context.roles)) {
    return {
      response: jsonError("forbidden", "You do not have permission to perform this action.", 403),
    };
  }

  return { context };
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
