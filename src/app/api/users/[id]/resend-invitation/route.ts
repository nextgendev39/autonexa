import { jsonAuthResponse } from "@/lib/auth/http";
import { resendVerificationCode } from "@/lib/auth/email-verification-server";
import { isMailerConfigured } from "@/lib/email/send-email";
import { tenantClient } from "@/lib/server/privileged";
import { memberEmail } from "@/lib/server/privileged/members";
import { getActiveSuperAdmin } from "@/lib/users/guard";
import { authErrorState, authSuccessState } from "@/types/auth";

function fail(key: string, status = 400) {
  return jsonAuthResponse(authErrorState(`modules.users.errors.${key}`), { status });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getActiveSuperAdmin();
  if (!context) return fail("unauthorized", 403);

  const { id } = await params;
  const admin = tenantClient(context);

  const { data: target } = await admin
    .from("profiles")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) return fail("notFound", 404);
  // Once accepted (verified + password set) there is nothing left to resend.
  if (target.status !== "invited") return fail("invitationAccepted", 409);

  if (!isMailerConfigured()) return fail("emailNotConfigured");

  const email = await memberEmail(admin, id);
  if (!email) return fail("notFound", 404);

  const result = await resendVerificationCode(email);
  if (result.status === "success") return jsonAuthResponse(authSuccessState());

  switch (result.error) {
    case "resendCooldown":
      return fail("inviteCooldown", 429);
    // Verified but never set a password: a new code wouldn't help them.
    case "alreadyVerified":
      return fail("inviteAlreadyVerified", 409);
    case "notFound":
      return fail("notFound", 404);
    case "emailFailed":
      return fail("emailFailed");
    default:
      return fail("resendFailed");
  }
}
