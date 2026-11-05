import { cookies } from "next/headers";

import { mapAuthError, authErrorKeys } from "@/lib/auth/errors";
import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { RESET_GRANT_COOKIE, resetPasswordWithGrant } from "@/lib/auth/password-reset-server";
import { createClient } from "@/lib/supabase/server";
import { firstFieldErrors, resetPasswordSchema } from "@/lib/validation";
import { authErrorState, authFieldErrorState, authSuccessState } from "@/types/auth";

/**
 * { password, confirmPassword } — only works with the grant cookie set by a
 * correct reset code. A signed-in session alone can't change the password here.
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonAuthResponse(authFieldErrorState(firstFieldErrors(parsed.error)));
  }

  const cookieStore = await cookies();
  const outcome = await resetPasswordWithGrant(
    cookieStore.get(RESET_GRANT_COOKIE)?.value,
    parsed.data.password,
  );

  if (outcome.status === "error") {
    // Weak/same password: the grant was released, so they can try again.
    if (outcome.error === "auth") {
      return jsonAuthResponse(authErrorState(mapAuthError(outcome.authError)));
    }
    cookieStore.delete(RESET_GRANT_COOKIE);
    return jsonAuthResponse(authErrorState(authErrorKeys[outcome.error]));
  }

  cookieStore.delete(RESET_GRANT_COOKIE);
  // Drop any session in this browser so the login page isn't bounced to the dashboard.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => null);

  return jsonAuthResponse(authSuccessState("/login?reset=success"));
}
