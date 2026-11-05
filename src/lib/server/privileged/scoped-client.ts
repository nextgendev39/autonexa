import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables owned by a dealership: every statement is confined to one tenant_id. */
const TENANT_TABLES = new Set([
  "acquisition_status_history",
  "acquisitions",
  "audit_logs",
  "branch_locations",
  "branches",
  "customers",
  "documents",
  "notifications",
  "profiles",
  "push_subscriptions",
  "reservations",
  "sales",
  "staff_documents",
  "suppliers",
  "system_settings",
  "tenant_members",
  "user_roles",
  "vehicle_expenses",
  "vehicle_photos",
  "vehicle_pricing",
  "vehicle_pricing_history",
  "vehicle_share_links",
  "vehicle_status_history",
  "vehicles",
]);

/** Shared by every dealership: readable here, changed only by platform code. */
const SHARED_READ_ONLY_TABLES = new Set([
  "document_types",
  "permissions",
  "role_permissions",
  "roles",
  "vehicle_makes",
  "vehicle_model_years",
  "vehicle_models",
  "vehicle_variants",
]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(`Tenant scope violation: ${message}`);
    this.name = "TenantScopeError";
  }
}

type Row = Record<string, unknown>;

/**
 * A service-role client that cannot leave one dealership. The service role bypasses RLS, so
 * this adds the tenant filter itself and states the tenant on every new row. Storage and RPCs
 * cannot be filtered this way: callers take paths and IDs from rows read through this client.
 */
export function createScopedClient<
  Client extends { from: unknown; rpc: unknown; storage: unknown },
>(raw: Client, tenantId: string) {
  if (!tenantId) throw new TenantScopeError("a tenant is required");

  const withTenant = (row: Row) => {
    if ("tenant_id" in row && row.tenant_id !== tenantId) {
      throw new TenantScopeError("a row names a different tenant");
    }
    return { ...row, tenant_id: tenantId };
  };
  const stamp = (values: Row | Row[]) =>
    Array.isArray(values) ? values.map(withTenant) : withTenant(values);

  const from = (table: string) => {
    // The builders are generated per table, so they are driven untyped here; the public
    // signature below keeps the normal typed client API for callers.
    const builder = () => (raw as unknown as SupabaseClient).from(table);

    if (SHARED_READ_ONLY_TABLES.has(table)) {
      return {
        select: (...args: Parameters<ReturnType<typeof builder>["select"]>) =>
          builder().select(...args),
      };
    }
    if (!TENANT_TABLES.has(table)) {
      throw new TenantScopeError(`${table} is not available to dealership code`);
    }

    return {
      select: (...args: Parameters<ReturnType<typeof builder>["select"]>) =>
        builder()
          .select(...args)
          .eq("tenant_id", tenantId),
      insert: (values: Row | Row[], options?: { count?: "exact" | "planned" | "estimated" }) =>
        builder().insert(stamp(values), options),
      upsert: (
        values: Row | Row[],
        options?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) => builder().upsert(stamp(values), options),
      update: (values: Row, options?: { count?: "exact" | "planned" | "estimated" }) => {
        if ("tenant_id" in values) throw new TenantScopeError("tenant_id cannot be changed");
        return builder().update(values, options).eq("tenant_id", tenantId);
      },
      delete: (options?: { count?: "exact" | "planned" | "estimated" }) =>
        builder().delete(options).eq("tenant_id", tenantId),
    };
  };

  return {
    tenantId,
    from: from as unknown as Client["from"],
    /** Service-only RPCs take IDs: check them through `from` first. */
    rpc: (raw as unknown as SupabaseClient).rpc.bind(raw) as unknown as Client["rpc"],
    /** Object paths are unscoped: use only paths read through `from` or built from them. */
    storage: raw.storage as Client["storage"],
  };
}
