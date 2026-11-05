import { readJsonBody } from "@/lib/auth/http";
import {
  getPasswordResetStatus,
  RESET_GRANT_COOKIE,
  RESET_GRANT_TTL_SECONDS,
  verifyPasswordResetCode,
} from "@/lib/auth/password-reset-server";
import { respond } from "@/lib/auth/verification-response";

/** Current code window, so a refresh restores the countdowns instead of resetting them. */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email");
  return respond(await getPasswordResetStatus(email));
}

/** { email, otp } — a correct code sets the single-use reset grant cookie. */
export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { email?: unknown; otp?: unknown } | null;
  if (!body || typeof body !== "object") {
    return respond({ status: "error", error: "invalidCode" });
  }

  const { result, grant } = await verifyPasswordResetCode(body.email, body.otp);
  const response = respond(result);
  if (result.status === "success" && grant) {
    response.cookies.set(RESET_GRANT_COOKIE, grant, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: RESET_GRANT_TTL_SECONDS,
    });
  }
  return response;
}
