import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isProtectedPath } from "@/config/routes";
import { getSupabaseAnonKey, isSupabaseConfigured } from "@/lib/supabase/env";
import type { AuthUser } from "@/types/auth";
import type { Database } from "@/types/database";

function redirectTo(request: NextRequest, from: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirectResponse = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

function gate(request: NextRequest, response: NextResponse, user: AuthUser | null) {
  if (response.headers.has("location")) return response;

  const { pathname } = request.nextUrl;

  if (!user && (isProtectedPath(pathname) || pathname === "/")) {
    return redirectTo(request, response, "/login");
  }

  // Recovery / invite sessions must keep these routes reachable while signed in.
  if (
    user &&
    (pathname === "/" || pathname === "/login" || pathname === "/forgot-password")
  ) {
    return redirectTo(request, response, "/dashboard");
  }

  return response;
}

export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isSupabaseConfigured()) {
    return gate(request, response, null);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseAnonKey();
  if (!url || !key) return gate(request, response, null);

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const { data } = await supabase.auth.getClaims();
    const user = data?.claims
      ? {
          id: data.claims.sub,
          email: typeof data.claims.email === "string" ? data.claims.email : null,
        }
      : null;
    return gate(request, response, user);
  } catch {
    return gate(request, response, null);
  }
}
