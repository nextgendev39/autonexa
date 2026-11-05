import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { jsonError } from "@/lib/api/http";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  canPlatform,
  type PlatformContext,
  type PlatformPermission,
  type PlatformRole,
} from "@/lib/platform/permissions";

/**
 * Who is acting on the platform, decided by the database from the signed-in user. Nothing from the
 * request is involved, and a dealership Super Admin gets null here unless they also hold a role.
 */
export const getPlatformContext = cache(async (): Promise<PlatformContext | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub;
  if (!sub) return null;

  const { data, error } = await supabase.rpc("current_platform_access" as never);
  if (error || !data) return null;
  const access = data as unknown as { role: PlatformRole; permissions: PlatformPermission[] };
  return {
    userId: sub,
    email: typeof claims.claims.email === "string" ? claims.claims.email : null,
    role: access.role,
    permissions: access.permissions,
  };
});

/** For console pages. People with no console access go back to where they belong. */
export async function requirePlatformPage(permission?: PlatformPermission): Promise<PlatformContext> {
  const context = await getPlatformContext();
  if (!context || !canPlatform(context, "console.access")) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims ? "/dashboard" : "/login");
  }
  if (permission && !canPlatform(context, permission)) redirect("/platform");
  return context;
}

/** For console API routes. Every handler under /api/platform must start with this. */
export async function requirePlatformApi(permission: PlatformPermission) {
  const context = await getPlatformContext();
  if (!context) return { response: jsonError("forbidden", "Platform access required.", 403) };
  if (!canPlatform(context, "console.access") || !canPlatform(context, permission)) {
    return { response: jsonError("forbidden", "You do not have permission to do this.", 403) };
  }
  return { context };
}
