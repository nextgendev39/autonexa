import { redirect } from "next/navigation";

import { requireUserContext } from "@/lib/auth/session";
import type { Permission } from "@/lib/permissions";
import { permissionAllowedByPlan } from "@/lib/platform/features";
import type { UserContext } from "@/types/auth";

export async function requirePagePermission(permission: Permission): Promise<UserContext> {
  const context = await requireUserContext();
  if (
    (!context.permissions.includes(permission) && !context.roles.includes("super_admin")) ||
    !permissionAllowedByPlan(permission, context.disabledFeatures)
  ) {
    redirect("/unauthorized");
  }
  return context;
}

export async function requireAnyPagePermission(
  permissions: Permission[],
): Promise<UserContext> {
  const context = await requireUserContext();
  const allowed =
    context.roles.includes("super_admin") ||
    permissions.some((permission) => context.permissions.includes(permission));
  const onPlan = permissions.some((permission) =>
    permissionAllowedByPlan(permission, context.disabledFeatures),
  );
  if (!allowed || !onPlan) redirect("/unauthorized");
  return context;
}
