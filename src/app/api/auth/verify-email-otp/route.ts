import { readJsonBody } from "@/lib/auth/http";
import { getVerificationStatus, verifyEmailCode } from "@/lib/auth/email-verification-server";
import { respond } from "@/lib/auth/verification-response";

/** Current code window, so a refresh restores the countdowns instead of resetting them. */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email");
  return respond(await getVerificationStatus(email));
}

/** { email, otp } — the code only ever travels in the request body. */
export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { email?: unknown; otp?: unknown } | null;
  if (!body || typeof body !== "object") {
    return respond({ status: "error", error: "invalidCode" });
  }
  return respond(await verifyEmailCode(body.email, body.otp));
}
