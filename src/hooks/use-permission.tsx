"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { hasPermission, type Permission } from "@/lib/permissions";
import type { UserContext } from "@/types/auth";

const PermissionContext = createContext<UserContext | null>(null);

export function PermissionProvider({
  value,
  children,
}: {
  value: UserContext;
  children: ReactNode;
}) {
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function useUserContext() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error("useUserContext must be used within PermissionProvider");
  }
  return context;
}

export function usePermission() {
  const user = useUserContext();

  return useMemo(() => {
    const can = (permission: Permission) =>
      hasPermission(user.permissions, permission, user.roles);

    const canAny = (permissions: Permission[]) => permissions.some((permission) => can(permission));

    return { can, canAny, user };
  }, [user]);
}
