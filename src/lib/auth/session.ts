import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Permission } from "@/lib/permissions";
import { isPermission } from "@/lib/permissions";
import type { AuthUser, BranchAccessScope, UserContext, UserStatus } from "@/types/auth";

type ProfileRow = {
  id: string;
  display_name: string;
  employee_code: string | null;
  phone: string | null;
  avatar_url: string | null;
  branch_id: string | null;
  status: "active" | "invited" | "suspended" | "disabled";
  deleted_at: string | null;
};

type UserRoleBranchRow = {
  branch_id: string | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Roles and permissions come from definer functions scoped to the user's dealership. */
async function loadRolesAndPermissions(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{
  tenantId: string | null;
  roles: string[];
  permissions: Permission[];
  roleBranches: UserRoleBranchRow[];
}> {
  const [tenantRpc, rolesRpc, permsRpc, branchesQuery] = await Promise.all([
    supabase.rpc("current_tenant_id" as never),
    supabase.rpc("current_user_roles"),
    supabase.rpc("current_user_permissions"),
    supabase.from("user_roles").select("branch_id").eq("user_id", userId),
  ]);

  return {
    // Fails closed: if the tenant cannot be resolved, the user has no dealership access.
    tenantId: tenantRpc.error ? null : ((tenantRpc.data as unknown as string | null) ?? null),
    roles: rolesRpc.error ? [] : asStringArray(rolesRpc.data),
    permissions: permsRpc.error ? [] : asStringArray(permsRpc.data).filter(isPermission),
    roleBranches: branchesQuery.error ? [] : ((branchesQuery.data ?? []) as UserRoleBranchRow[]),
  };
}

function mapStatus(status: ProfileRow["status"]): UserStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "invited":
      return "INVITED";
    case "suspended":
      return "SUSPENDED";
    case "disabled":
      return "DISABLED";
  }
}

function deriveBranchScope(
  roleBranches: UserRoleBranchRow[],
  homeBranchId: string | null,
): { accessibleBranchIds: string[]; branchScope: BranchAccessScope } {
  const hasGlobal = roleBranches.some((row) => row.branch_id === null);
  if (hasGlobal) {
    return { accessibleBranchIds: [], branchScope: "ALL_BRANCHES" };
  }

  const branches = Array.from(
    new Set(
      roleBranches
        .map((row) => row.branch_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  if (branches.length > 0) {
    return { accessibleBranchIds: branches, branchScope: "ASSIGNED_BRANCHES" };
  }

  if (homeBranchId) {
    return { accessibleBranchIds: [homeBranchId], branchScope: "OWN_BRANCH" };
  }

  return { accessibleBranchIds: [], branchScope: "OWN_BRANCH" };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Memoized per request: layouts, pages and helpers share one lookup. */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;

  const [{ data: profile, error: profileError }, { tenantId, roles, permissions, roleBranches }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, employee_code, phone, avatar_url, branch_id, status, deleted_at")
        .eq("id", userId)
        .maybeSingle(),
      loadRolesAndPermissions(userId, supabase),
    ]);

  if (profileError || !profile) return null;
  const profileRow = profile as ProfileRow;
  if (profileRow.deleted_at) return null;
  const { accessibleBranchIds, branchScope } = deriveBranchScope(
    roleBranches,
    profileRow.branch_id,
  );

  return {
    tenantId,
    userId,
    profileId: profileRow.id,
    email,
    displayName: profileRow.display_name,
    employeeCode: profileRow.employee_code,
    phone: profileRow.phone,
    avatarUrl: profileRow.avatar_url,
    branchId: profileRow.branch_id,
    roles,
    permissions: permissions as Permission[],
    // Without an active dealership (removed, or the dealership is suspended) the user is treated
    // as suspended: every page and API check already turns that away.
    status: tenantId ? mapStatus(profileRow.status) : "SUSPENDED",
    accessibleBranchIds,
    branchScope,
  };
});

export async function requireUserContext(): Promise<UserContext> {
  const context = await getUserContext();
  if (!context) redirect("/login");

  // Signing out needs a route handler: Server Components can't clear the cookie.
  if (context.status === "SUSPENDED" || context.status === "DISABLED") {
    redirect("/api/auth/inactive");
  }

  return context;
}

export async function requirePermission(permission: Permission): Promise<UserContext> {
  const context = await requireUserContext();
  if (!context.permissions.includes(permission) && !context.roles.includes("super_admin")) {
    redirect("/unauthorized");
  }
  return context;
}
