import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Where pages send a signed-in user whose account was suspended or disabled.
 * Server Components can't clear the session cookie, so signing out happens
 * here; otherwise the proxy bounces /login back to /dashboard in a loop.
 */
export async function GET(request: Request) {
  const context = await getUserContext();

  // Only end sessions that really are inactive, so this link can't log anyone out.
  if (context?.status === "ACTIVE") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (context) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const login = new URL("/login", request.url);
  if (context?.status === "SUSPENDED") login.searchParams.set("reason", "suspended");
  if (context?.status === "DISABLED") login.searchParams.set("reason", "disabled");
  return NextResponse.redirect(login);
}
