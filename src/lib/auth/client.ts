"use client";

import { authErrorState, initialAuthState, type AuthActionState } from "@/types/auth";

function isAuthActionState(value: unknown): value is AuthActionState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === "idle" || record.status === "error" || record.status === "success") &&
    (typeof record.formError === "string" || record.formError === null) &&
    typeof record.fieldErrors === "object" &&
    record.fieldErrors !== null &&
    (typeof record.redirectTo === "string" || record.redirectTo === null) &&
    (typeof record.details === "string" || record.details === null || record.details === undefined)
  );
}

export async function postAuthJson(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "PATCH" = "POST",
): Promise<AuthActionState> {
  try {
    const response = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });

    const data: unknown = await response.json().catch(() => null);
    if (isAuthActionState(data)) return data;

    return authErrorState("auth.errors.generic");
  } catch {
    return authErrorState("auth.errors.generic");
  }
}

export { initialAuthState };
