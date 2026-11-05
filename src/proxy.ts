import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "@/lib/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18n = createIntlMiddleware(routing);

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`.
 * Session refresh still lives in `lib/supabase/middleware.ts`.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes must return JSON — skip i18n rewriting entirely.
  if (pathname.startsWith("/api/")) {
    return updateSession(request, NextResponse.next());
  }

  const response = handleI18n(request);
  return updateSession(request, response);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
