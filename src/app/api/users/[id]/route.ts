import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { getActiveSuperAdmin } from "@/lib/users/guard";
import { tenantClient } from "@/lib/server/privileged";
import { updateMemberEmail } from "@/lib/server/privileged/members";
import { createClient } from "@/lib/supabase/server";
import { authErrorState, authFieldErrorState, authSuccessState } from "@/types/auth";
import { updateUserSchema } from "@/lib/validation/user";
import { firstFieldErrors } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getActiveSuperAdmin();
  if (!context) {
    return jsonAuthResponse(authErrorState("modules.users.errors.unauthorized"), { status: 403 });
  }

  const { id } = await params;
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonAuthResponse({ status: "error", formError: null, fieldErrors: firstFieldErrors(parsed.error), redirectTo: null, details: null }, { status: 400 });
  }

  const { email, firstName, lastName, roleKey, status } = parsed.data;
  const admin = tenantClient(context);

  const { data: target } = await admin
    .from("profiles")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) {
    return jsonAuthResponse(authErrorState("modules.users.errors.notFound"), { status: 404 });
  }

  const statusChanged = status !== undefined && status !== target.status;
  if (statusChanged && id === context.userId) {
    return jsonAuthResponse(authFieldErrorState({ status: "modules.users.errors.cannotChangeOwnStatus" }));
  }
  // Pending invites only become active by verifying their email.
  if (statusChanged && target.status === "invited") {
    return jsonAuthResponse(authFieldErrorState({ status: "modules.users.errors.invitedStatusLocked" }));
  }

  // Update email in auth if provided
  if (email) {
    const { error } = await updateMemberEmail(admin, id, email);
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered")) {
        return jsonAuthResponse(authErrorState("modules.users.errors.alreadyExists"), { status: 400 });
      }
      return jsonAuthResponse(authErrorState("modules.users.errors.updateFailed"), { status: 400 });
    }
  }

  // Replace the user's role(s) with the selected one. RPCs run as the caller so
  // their super-admin checks and audit logging apply.
  if (roleKey) {
    const { data: assignments } = await admin
      .from("user_roles")
      .select("id, roles(key)")
      .eq("user_id", id);
    const current = (assignments ?? []) as unknown as { id: string; roles: { key: string } | null }[];
    const alreadyOnly = current.length === 1 && current[0].roles?.key === roleKey;

    if (!alreadyOnly) {
      const supabase = await createClient();
      const { data: keptId, error: assignError } = await supabase.rpc("assign_user_role", {
        target_user_id: id,
        role_key: roleKey,
        target_branch_id: null,
      });
      if (assignError) {
        return jsonAuthResponse(authErrorState("modules.users.errors.updateFailed", {}, assignError.message), { status: 400 });
      }

      for (const assignment of current) {
        if (assignment.id === keptId) continue;
        const { error: revokeError } = await supabase.rpc("revoke_user_role", { assignment_id: assignment.id });
        if (revokeError) {
          const key = revokeError.message.includes("own super_admin")
            ? "modules.users.errors.cannotRemoveOwnSuperAdmin"
            : "modules.users.errors.updateFailed";
          return jsonAuthResponse(authErrorState(key, {}, revokeError.message), { status: 400 });
        }
      }
    }
  }

  if (statusChanged) {
    const { error } = await admin
      .from("profiles")
      .update({ status })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) {
      return jsonAuthResponse(authErrorState("modules.users.errors.updateFailed"), { status: 400 });
    }
  }

  // Update profile name fields if provided
  if (firstName || lastName) {
    const { data: current } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", id)
      .maybeSingle();
    const fn = firstName ?? current?.first_name ?? "";
    const ln = lastName ?? current?.last_name ?? "";
    const display_name = `${fn} ${ln}`.trim();

    const profilePatch = {
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
      display_name,
    };

    const { error } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", id)
      .is("deleted_at", null);
    if (error) {
      return jsonAuthResponse(authErrorState("modules.users.errors.updateFailed"), { status: 400 });
    }
  }

  return jsonAuthResponse(authSuccessState());
}
