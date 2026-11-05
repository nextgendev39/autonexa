import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { createPrivilegedClient, hasServiceRoleKey, type PrivilegedClient } from "./client";
import { createScopedClient, TenantScopeError } from "./scoped-client";

export { hasServiceRoleKey, TenantScopeError };
export type { PrivilegedClient };

export type TenantClient = ReturnType<typeof createScopedClient<PrivilegedClient>>;

/** Scoped to a tenant the server resolved itself, such as `UserContext.tenantId`. */
export function tenantClient(source: { tenantId: string | null }): TenantClient {
  if (!source.tenantId) throw new TenantScopeError("the user has no active dealership");
  return createScopedClient(createPrivilegedClient(), source.tenantId);
}

const currentTenantId = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_tenant_id" as never);
  if (error) throw new TenantScopeError(`could not resolve the tenant: ${error.message}`);
  return (data as unknown as string | null) ?? null;
});

/**
 * Scoped to the signed-in user's dealership, resolved by the database from their membership.
 * Nothing from the request body, query or headers is involved.
 */
export async function currentTenantClient(): Promise<TenantClient> {
  return tenantClient({ tenantId: await currentTenantId() });
}

/** For work outside a session (alerts after the response): scoped to that person's dealership. */
export async function tenantClientForUser(userId: string): Promise<TenantClient> {
  const { data, error } = await createPrivilegedClient()
    .from("tenant_members" as never)
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new TenantScopeError(`could not resolve the tenant: ${error.message}`);
  return tenantClient({
    tenantId: (data as unknown as { tenant_id: string } | null)?.tenant_id ?? null,
  });
}

/**
 * Sees every dealership. Only for work with no tenant yet or that spans them: login codes and
 * password reset, background sweeps, and the public share page. The tenant test suite fails
 * when a file outside its allowlist calls this.
 */
export function platformClient(): PrivilegedClient {
  return createPrivilegedClient();
}
