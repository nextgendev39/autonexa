"use client";

import type { ReactNode } from "react";

import { usePermission } from "@/hooks/use-permission";
import type { Permission } from "@/lib/permissions";

export function PermissionGate({
  permission,
  permissions,
  mode = "hide",
  fallback = null,
  children,
}: {
  permission?: Permission;
  permissions?: Permission[];
  mode?: "hide" | "disable";
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny } = usePermission();
  const allowed = permission
    ? can(permission)
    : permissions
      ? canAny(permissions)
      : false;

  if (allowed) return <>{children}</>;
  if (mode === "disable") {
    return (
      <span className="pointer-events-none inline-flex opacity-40" aria-disabled>
        {children}
      </span>
    );
  }
  return <>{fallback}</>;
}

/** Alias for PermissionGate */
export function Can(props: Parameters<typeof PermissionGate>[0]) {
  return <PermissionGate {...props} />;
}
