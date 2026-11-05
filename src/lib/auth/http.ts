import { NextResponse } from "next/server";

import { authErrorState, type AuthActionState } from "@/types/auth";

export function jsonAuthResponse(body: AuthActionState, init?: ResponseInit) {
  const status =
    body.status === "error"
      ? body.formError || Object.keys(body.fieldErrors).length > 0
        ? 400
        : 400
      : 200;

  return NextResponse.json(body, { ...init, status: init?.status ?? status });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function invalidJsonResponse() {
  return jsonAuthResponse(authErrorState("auth.errors.generic"));
}
