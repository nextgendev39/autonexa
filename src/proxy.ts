import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "@/lib/i18n/routing";
import {
  hostSettingsFromEnv,
  internalSitePath,
  isInternalSitePath,
  isStorefrontHost,
  routeStorefrontPath,
} from "@/lib/storefront/host";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18n = createIntlMiddleware(routing);

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`.
 * Session refresh still lives in `lib/supabase/middleware.ts`.
 */
const notFound = () => new NextResponse("Not found", { status: 404 });

/** A dealership's host. Sessions and the staff app don't exist here. */
function storefrontProxy(request: NextRequest) {
  const route = routeStorefrontPath(request.nextUrl.pathname);
  if (route.kind === "not_found") return notFound();
  const url = request.nextUrl.clone();
  if (route.kind === "api") {
    if (url.pathname === route.path) return NextResponse.next();
    url.pathname = route.path;
    return NextResponse.rewrite(url);
  }
  url.pathname = internalSitePath(route.locale, route.path);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-NEXT-INTL-LOCALE", route.locale);
  // Lets a dealership whose language is Arabic send unprefixed addresses to /ar.
  if (route.explicitLocale) requestHeaders.delete("x-storefront-unprefixed");
  else requestHeaders.set("x-storefront-unprefixed", route.path);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStorefrontHost(request.headers.get("host"), hostSettingsFromEnv())) {
    return storefrontProxy(request);
  }

  // On the staff app's host, website pages and public website endpoints don't exist.
  if (isInternalSitePath(pathname) || pathname === "/api/storefront" || pathname.startsWith("/api/storefront/")) {
    return notFound();
  }

  // API routes must return JSON and handle their own sessions, as they always have here.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const response = handleI18n(request);
  return updateSession(request, response);
}

export const config = {
  matcher: [
    // API routes too, so a dealership's domain can't reach the staff app's API.
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
