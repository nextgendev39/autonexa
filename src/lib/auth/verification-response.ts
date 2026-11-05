import { NextResponse } from "next/server";

import type { VerificationApiResponse, VerificationErrorKey } from "@/lib/auth/email-verification";

const errorStatus: Record<VerificationErrorKey, number> = {
  invalidCode: 400,
  expired: 410,
  tooManyAttempts: 429,
  resendCooldown: 429,
  emailFailed: 502,
  network: 503,
  alreadyVerified: 409,
  notFound: 404,
  generic: 500,
};

export function respond(result: VerificationApiResponse) {
  const status = result.status === "success" ? 200 : errorStatus[result.error];
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.status === "error" && result.retryAfterSeconds) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }
  return NextResponse.json(result, { status, headers });
}
