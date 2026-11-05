import "server-only";

import { createPrivilegedClient } from "./client";
import type { TenantClient } from "./index";

export type MemberAuthDetails = {
  user_id: string;
  email: string | null;
  last_sign_in_at: string | null;
};

/** Login details for this dealership's people only. Replaces listing every auth user. */
export async function memberAuthDetails(client: TenantClient): Promise<MemberAuthDetails[]> {
  const { data, error } = await createPrivilegedClient().rpc(
    "tenant_member_auth_details" as never,
    { p_tenant_id: client.tenantId } as never,
  );
  if (error) throw new Error(`Could not load member details: ${error.message}`);
  return (data ?? []) as unknown as MemberAuthDetails[];
}

export async function isMember(client: TenantClient, userId: string) {
  const { data } = await client
    .from("tenant_members" as never)
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function memberEmail(client: TenantClient, userId: string) {
  const details = await memberAuthDetails(client);
  return details.find((member) => member.user_id === userId)?.email ?? null;
}

/** Creates the login, then places it in this dealership. No password yet, no email sent. */
export async function createInvitedMember(
  client: TenantClient,
  input: { email: string; firstName: string; lastName: string },
) {
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

  // A new profile may have no tenant yet, so this one update cannot go through the scoped client.
  const { error: placeError } = await admin
    .from("profiles")
    .update({ tenant_id: client.tenantId } as never)
    .eq("id", data.user.id);
  if (placeError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { userId: null, error: placeError };
  }
  return { userId: data.user.id, error: null };
}

/** Removes a login created moments ago by a failed invite. Refuses anyone outside this dealership. */
export async function deleteInvitedMember(client: TenantClient, userId: string) {
  if (await isMember(client, userId)) {
    await createPrivilegedClient().auth.admin.deleteUser(userId);
  }
}

/** Changes a member's login email. Refuses anyone outside this dealership. */
export async function updateMemberEmail(client: TenantClient, userId: string, email: string) {
  if (!(await isMember(client, userId))) return { error: { message: "not a member" } };
  const { error } = await createPrivilegedClient().auth.admin.updateUserById(userId, { email });
  return { error };
}
