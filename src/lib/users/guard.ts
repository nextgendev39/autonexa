import { getUserContext } from "@/lib/auth/session";

/**
 * User-management routes use the service-role client, which bypasses RLS, so the
 * caller must be checked here: a Super Admin whose account is still active.
 */
export async function getActiveSuperAdmin() {
  const context = await getUserContext();
  if (!context || context.status !== "ACTIVE" || !context.roles.includes("super_admin")) {
    return null;
  }
  return context;
}
