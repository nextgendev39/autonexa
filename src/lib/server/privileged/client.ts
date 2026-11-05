import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabaseEnv } from "@/lib/supabase/env";
import { fetchWithTimeout } from "@/lib/supabase/timeout";
import type { Database } from "@/types/database";

export function hasServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * The raw service-role client: it bypasses RLS and sees every dealership. Only this folder
 * may import it. A lint rule and the tenant test suite enforce that.
 */
export function createPrivilegedClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  const { url } = requireSupabaseEnv();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Longer than request queries: staff document uploads go through this client.
    global: { fetch: fetchWithTimeout(60_000) },
  });
}

export type PrivilegedClient = ReturnType<typeof createPrivilegedClient>;
