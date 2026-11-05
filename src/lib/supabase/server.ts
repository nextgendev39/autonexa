import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabaseEnv } from "@/lib/supabase/env";
import { fetchWithTimeout } from "@/lib/supabase/timeout";
import type { Database } from "@/types/database";

/**
 * Server client for Server Components, Server Actions, and Route Handlers.
 * Uses the anon/publishable key plus the user session. The service-role key is
 * intentionally not read here and must never be exposed to the browser.
 */
export async function createClient() {
  const { url, key } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    global: { fetch: fetchWithTimeout(20_000) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session.
        }
      },
    },
  });
}
