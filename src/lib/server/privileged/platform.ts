import "server-only";

import { createPrivilegedClient } from "./client";
import { tenantClient } from "./index";
import { createInvitedMember, deleteInvitedMember, memberAuthDetails } from "./members";

/**
 * What the platform console cannot do through the signed-in user's session: creating logins and
 * placing them. Callers check the platform permission first. Nothing here reads dealership records.
 */

type NewLogin = { email: string; firstName: string; lastName: string };

/** A dealership's first Super Admin, with no password until they accept the invitation. */
export async function createDealershipOwner(dealershipId: string, input: NewLogin) {
  const client = tenantClient({ tenantId: dealershipId });
  const { userId, error } = await createInvitedMember(client, input);
  if (error || !userId) return { userId: null, error };

  const { data: role } = await client.from("roles").select("id").eq("key", "super_admin").maybeSingle();
  const { error: roleError } = await client
    .from("user_roles")
    .insert({ user_id: userId, role_id: (role as { id: string } | null)?.id } as never);
  if (roleError) {
    await deleteInvitedMember(client, userId);
    return { userId: null, error: roleError };
  }
  return { userId, error: null };
}

/**
 * Whether anyone holds a Super Admin role, invited or active. Inviting one into a dealership that
 * has one would let platform staff give themselves its private data, so that is refused.
 */
export async function dealershipHasOwner(dealershipId: string) {
  const { data, error } = await tenantClient({ tenantId: dealershipId })
    .from("user_roles")
    .select("id, roles!inner(key)")
    .eq("roles.key", "super_admin")
    .limit(1);
  // Unknown counts as yes: this is a safety check, and failing it only blocks an invitation.
  return Boolean(error) || (data ?? []).length > 0;
}

export async function removeDealershipOwner(dealershipId: string, userId: string) {
  await deleteInvitedMember(tenantClient({ tenantId: dealershipId }), userId);
}

/** A login that belongs to no dealership, for platform staff. */
export async function createStaffLogin(input: NewLogin) {
  const admin = createPrivilegedClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: false,
    user_metadata: {
      first_name: input.firstName,
      last_name: input.lastName,
      full_name: `${input.firstName} ${input.lastName}`.trim(),
    },
  });
  if (error || !data?.user?.id) return { userId: null, error };

  // With one dealership, a new profile lands in it by default. Platform staff must not.
  const { error: placeError } = await admin
    .from("profiles")
    .update({ tenant_id: null } as never)
    .eq("id", data.user.id);
  if (placeError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { userId: null, error: placeError };
  }
  return { userId: data.user.id, error: null };
}

export async function removeStaffLogin(userId: string) {
  await createPrivilegedClient().auth.admin.deleteUser(userId);
}

/** Where to reach a dealership's Super Admins when they can't sign in to read a notification. */
export async function dealershipAdminEmails(dealershipId: string) {
  const client = tenantClient({ tenantId: dealershipId });
  const [{ data: ids }, members] = await Promise.all([
    client.rpc("active_super_admin_ids" as never, { p_tenant_id: dealershipId } as never),
    memberAuthDetails(client),
  ]);
  const admins = new Set((ids ?? []) as unknown as string[]);
  return members
    .filter((member) => admins.has(member.user_id) && member.email)
    .map((member) => member.email as string);
}

export async function platformOwnerExists() {
  const { data, error } = await createPrivilegedClient()
    .from("platform_admins" as never)
    .select("user_id")
    .eq("role", "owner")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * The very first owner: a new login with a password, belonging to no dealership. Only ever creates a
 * new login, so this can't promote an existing account. If someone else got there first, the login made
 * here is removed again.
 */
export async function createFirstOwner(input: NewLogin & { password: string }) {
  try {
    if (await platformOwnerExists()) return { error: "already_exists" as const };
  } catch (error) {
    console.error("[platform] could not check for a first owner", error);
    return { error: "failed" as const };
  }

  const admin = createPrivilegedClient();
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, last_name: input.lastName, full_name: fullName },
  });
  const userId = data?.user?.id;
  if (error || !userId) {
    const message = error?.message?.toLowerCase() ?? "";
    return { error: message.includes("already") || message.includes("registered") ? ("email_taken" as const) : ("failed" as const) };
  }

  // With one dealership, a new login lands in it by default. Platform staff must not.
  const { error: placeError } = await admin
    .from("profiles")
    .update({ tenant_id: null, status: "active", first_name: input.firstName, last_name: input.lastName, display_name: fullName } as never)
    .eq("id", userId);
  const { data: claimed, error: claimError } = placeError
    ? { data: null, error: placeError }
    : await admin.rpc("platform_claim_first_owner" as never, { p_user_id: userId } as never);
  if (claimError || (claimed as unknown as boolean) !== true) {
    await admin.auth.admin.deleteUser(userId);
    if (claimError) {
      console.error("[platform] could not create the first owner", claimError.message);
      return { error: "failed" as const };
    }
    return { error: "already_exists" as const };
  }
  return { error: null };
}
