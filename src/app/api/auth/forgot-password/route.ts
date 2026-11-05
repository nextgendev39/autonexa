import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { sendPasswordResetCode, VERIFY_PATH } from "@/lib/auth/password-reset-server";
import { firstFieldErrors, forgotPasswordSchema } from "@/lib/validation";
import { authErrorState, authFieldErrorState, authSuccessState } from "@/types/auth";

/** { email } — emails a reset code and opens the code page (same answer for unknown emails). */
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonAuthResponse(authFieldErrorState(firstFieldErrors(parsed.error)));
  }

  const result = await sendPasswordResetCode(parsed.data.email, { initial: true });
  if (result.status === "error") {
    return jsonAuthResponse(
      authErrorState(
        result.error === "emailFailed" ? "auth.forgot.errors.emailFailed" : "auth.errors.generic",
      ),
    );
  }

  const params = new URLSearchParams({ email: result.challenge.email });
  return jsonAuthResponse(authSuccessState(`${VERIFY_PATH}?${params.toString()}`));
}
