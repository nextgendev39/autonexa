import type { Permission } from "@/lib/permissions";

export type AuthUser = {
  id: string;
  email: string | null;
};

export type UserStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "DISABLED";

export type BranchAccessScope = "ALL_BRANCHES" | "ASSIGNED_BRANCHES" | "OWN_BRANCH";

export type UserContext = {
  /** The active dealership, resolved by the database from membership. Never from the client. */
  tenantId: string | null;
  /** May edit the vehicle catalog shared by every dealership. Grants no other platform access. */
  canManageCatalog: boolean;
  /** AutoNexa staff with the Platform console. Such a login belongs to no dealership. */
  hasPlatformConsole: boolean;
  /** Modules this dealership's plan switches off. The database enforces this as well. */
  disabledFeatures: string[];
  userId: string;
  profileId: string;
  email: string | null;
  displayName: string;
  employeeCode: string | null;
  phone: string | null;
  avatarUrl: string | null;
  branchId: string | null;
  roles: string[];
  permissions: Permission[];
  status: UserStatus;
  accessibleBranchIds: string[];
  branchScope: BranchAccessScope;
};

/** Fully JSON-serializable auth API / form response. */
export type AuthActionState = {
  status: "idle" | "error" | "success";
  formError: string | null;
  fieldErrors: Record<string, string>;
  redirectTo: string | null;
  details: string | null;
};

export const initialAuthState: AuthActionState = {
  status: "idle",
  formError: null,
  fieldErrors: {},
  redirectTo: null,
  details: null,
};

export function authErrorState(
  formError: string,
  fieldErrors: Record<string, string> = {},
  details: string | null = null,
): AuthActionState {
  return {
    status: "error",
    formError,
    fieldErrors,
    redirectTo: null,
    details,
  };
}

export function authFieldErrorState(fieldErrors: Record<string, string>): AuthActionState {
  return {
    status: "error",
    formError: null,
    fieldErrors,
    redirectTo: null,
    details: null,
  };
}

export function authSuccessState(redirectTo: string | null = null): AuthActionState {
  return {
    status: "success",
    formError: null,
    fieldErrors: {},
    redirectTo,
    details: null,
  };
}
