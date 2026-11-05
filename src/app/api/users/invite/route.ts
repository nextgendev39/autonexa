import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { getActiveSuperAdmin } from "@/lib/users/guard";
import {
  pendingVerificationUserId,
  resendVerificationCode,
  startInviteVerification,
  VerificationEmailError,
} from "@/lib/auth/email-verification-server";
import { isMailerConfigured } from "@/lib/email/send-email";
import { checkPlanLimit } from "@/lib/platform/limits";
import { tenantClient } from "@/lib/server/privileged";
import { createInvitedMember, deleteInvitedMember, isMember } from "@/lib/server/privileged/members";
import { createClient } from "@/lib/supabase/server";
import { firstFieldErrors } from "@/lib/validation";
import { inviteUserSchema } from "@/lib/validation/user";
import { authErrorState, authFieldErrorState, authSuccessState } from "@/types/auth";

function fail(key: string, details: string | null = null) {
  return jsonAuthResponse(authErrorState(key, {}, details), { status: 400 });
}

export async function POST(request: Request) {
  const context = await getActiveSuperAdmin();
  if (!context) {
    return jsonAuthResponse(authErrorState("modules.users.errors.unauthorized"), { status: 403 });
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonAuthResponse(authFieldErrorState(firstFieldErrors(parsed.error)));
  }

  if (!isMailerConfigured()) {
    return fail("modules.users.errors.emailNotConfigured");
  }

  const { email, firstName, lastName, roleKey, branchId } = parsed.data;

  const admin = tenantClient(context);

  // Still-pending invite: send a fresh code (60s cooldown applies) instead of
  // creating a second account or role assignment. Another dealership's pending invite gets
  // the same answer as any email already in use, and its code is never re-sent from here.
  const pendingUserId = await pendingVerificationUserId(email);
  if (pendingUserId && !(await isMember(admin, pendingUserId))) {
    return jsonAuthResponse(authFieldErrorState({ email: "modules.users.errors.alreadyExists" }));
  }
  if (pendingUserId) {
    const resent = await resendVerificationCode(email);
    if (resent.status === "success") return jsonAuthResponse(authSuccessState());
    if (resent.error === "resendCooldown") {
      return jsonAuthResponse(authFieldErrorState({ email: "modules.users.errors.inviteCooldown" }));
    }
    if (resent.error === "alreadyVerified") {
      return jsonAuthResponse(authFieldErrorState({ email: "modules.users.errors.alreadyExists" }));
    }
    return fail(resent.error === "emailFailed" ? "modules.users.errors.emailFailed" : "modules.users.errors.verificationSetup");
  }

  const overLimit = await checkPlanLimit("users");
  if (overLimit) return fail(`modules.users.errors.${overLimit.code}`);

  // createUser sends no email, so Supabase's own confirmation link is never sent;
  // the only email is the app's OTP below. No password yet: it's set after verifying.
  const { userId: newUserId, error: createError } = await createInvitedMember(admin, {
    email,
    firstName,
    lastName,
  });

  if (createError || !newUserId) {
    const msg = createError?.message?.toLowerCase() ?? "";
    if (createError?.code === "email_exists" || msg.includes("already") || msg.includes("registered")) {
      return jsonAuthResponse(authFieldErrorState({ email: "modules.users.errors.alreadyExists" }));
    }
    return fail("modules.users.errors.inviteFailed", createError?.message ?? null);
  }

  // Role RPC runs as the caller so its super-admin checks and audit log apply.
  const supabase = await createClient();
  const { error: roleError } = await supabase.rpc("assign_user_role", {
    target_user_id: newUserId,
    role_key: roleKey,
    // assign_user_role refuses a branch outside this dealership.
    target_branch_id: branchId ?? null,
  });
  if (roleError) {
    await deleteInvitedMember(admin, newUserId);
    return fail("modules.users.errors.inviteFailed", roleError.message);
  }

  try {
    await startInviteVerification({ userId: newUserId, email });
  } catch (error) {
    // No code means the person can never verify, so don't leave a dangling account.
    await deleteInvitedMember(admin, newUserId);
    return fail(
      error instanceof VerificationEmailError
        ? "modules.users.errors.emailFailed"
        : "modules.users.errors.verificationSetup",
    );
  }

  return jsonAuthResponse(authSuccessState());
}
