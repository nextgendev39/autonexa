import { currentTenantClient } from "@/lib/server/privileged";
import { memberAuthDetails } from "@/lib/server/privileged/members";

export type UserListItem = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  status: "active" | "invited" | "suspended" | "disabled";
  roles: { key: string; name: string }[];
  /** The branch the role is limited to. Null means every branch. */
  branchId: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export async function listUsers(): Promise<UserListItem[]> {
  const admin = await currentTenantClient();

  const [profilesResult, members, roleAssignmentsResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, display_name, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    memberAuthDetails(admin),
    admin.from("user_roles").select("user_id, branch_id, roles(key, name)"),
  ]);

  const profiles = profilesResult.data ?? [];

  const emailMap = new Map(
    members.map((m) => [m.user_id, { email: m.email, lastSignInAt: m.last_sign_in_at }]),
  );

  const rolesByUser = new Map<string, { key: string; name: string }[]>();
  const branchByUser = new Map<string, string | null>();
  for (const row of roleAssignmentsResult.data ?? []) {
    const roleData = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    if (!roleData) continue;
    const userId = (row as { user_id: string }).user_id;
    const existing = rolesByUser.get(userId) ?? [];
    rolesByUser.set(userId, [...existing, { key: roleData.key, name: roleData.name }]);
    branchByUser.set(userId, (row as { branch_id: string | null }).branch_id);
  }

  return profiles.map((p) => ({
    id: p.id,
    email: emailMap.get(p.id)?.email ?? null,
    firstName: (p as { first_name: string | null }).first_name,
    lastName: (p as { last_name: string | null }).last_name,
    displayName: p.display_name,
    status: p.status as UserListItem["status"],
    roles: rolesByUser.get(p.id) ?? [],
    branchId: branchByUser.get(p.id) ?? null,
    createdAt: p.created_at,
    lastSignInAt: emailMap.get(p.id)?.lastSignInAt ?? null,
  }));
}

export type RoleOption = { key: string; name: string };
export type BranchOption = { id: string; name: string };

/** Branches a role can be limited to. */
export async function listBranchOptions(): Promise<BranchOption[]> {
  const admin = await currentTenantClient();
  const { data } = await admin
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as BranchOption[];
}

export async function listRoles(): Promise<RoleOption[]> {
  const admin = await currentTenantClient();
  const { data } = await admin.from("roles").select("key, name").order("name");
  return (data ?? []).map((r) => ({ key: r.key, name: r.name }));
}
