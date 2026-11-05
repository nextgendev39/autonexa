import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Permission } from "@/lib/permissions";
import { isPermission } from "@/lib/permissions";
import { permissionAllowedByPlan } from "@/lib/platform/features";
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
  canManageCatalog: boolean;
  hasPlatformConsole: boolean;
  disabledFeatures: string[];
  roles: string[];
  permissions: Permission[];
  roleBranches: UserRoleBranchRow[];
}> {
  const [tenantRpc, platformRpc, featuresRpc, rolesRpc, permsRpc, branchesQuery] = await Promise.all([
    supabase.rpc("current_tenant_id" as never),
    supabase.rpc("current_platform_access" as never),
    supabase.rpc("current_tenant_disabled_features" as never),
    supabase.rpc("current_user_roles"),
    supabase.rpc("current_user_permissions"),
    supabase.from("user_roles").select("branch_id").eq("user_id", userId),
  ]);

  const platformPermissions = platformRpc.error
    ? []
    : ((platformRpc.data as unknown as { permissions: string[] } | null)?.permissions ?? []);

  return {
    // Fails closed: if the tenant cannot be resolved, the user has no dealership access.
    tenantId: tenantRpc.error ? null : ((tenantRpc.data as unknown as string | null) ?? null),
    canManageCatalog: platformPermissions.includes("catalog.manage"),
    hasPlatformConsole: platformPermissions.includes("console.access"),
    // Only hides things in the app when it can't be read. The database still enforces the plan.
    disabledFeatures: featuresRpc.error ? [] : asStringArray(featuresRpc.data),
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

  const [
    { data: profile, error: profileError },
    { tenantId, canManageCatalog, hasPlatformConsole, disabledFeatures, roles, permissions, roleBranches },
  ] = await Promise.all([
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
    canManageCatalog,
    hasPlatformConsole,
    disabledFeatures,
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
    // as suspended: every page and API check already turns that away. An invited login is the
    // exception, since platform staff have no dealership and must still accept their invitation.
    status:
      tenantId || profileRow.status === "invited" ? mapStatus(profileRow.status) : "SUSPENDED",
    accessibleBranchIds,
    branchScope,
  };
});

/** Platform staff with no dealership, who read as suspended but aren't. */
export function isPlatformStaffOnly(context: UserContext) {
  return !context.tenantId && context.hasPlatformConsole;
}

export async function requireUserContext(): Promise<UserContext> {
  const context = await getUserContext();
  // A token can outlive its account, and the proxy would send /login straight back here.
  if (!context) redirect((await getSessionUser()) ? "/api/auth/inactive" : "/login");

  // Platform staff belong to no dealership. Without this they would read as suspended below.
  if (isPlatformStaffOnly(context)) redirect("/platform");

  // Signing out needs a route handler: Server Components can't clear the cookie.
  if (context.status === "SUSPENDED" || context.status === "DISABLED") {
    redirect("/api/auth/inactive");
  }

  return context;
}

export async function requirePermission(permission: Permission): Promise<UserContext> {
  const context = await requireUserContext();
  if (
    (!context.permissions.includes(permission) && !context.roles.includes("super_admin")) ||
    !permissionAllowedByPlan(permission, context.disabledFeatures)
  ) {
    redirect("/unauthorized");
  }
  return context;
}
