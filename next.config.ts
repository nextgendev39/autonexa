import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");
const root = path.dirname(fileURLToPath(import.meta.url));

/** Applied to every response. No CSP script rules: Next/next-intl inline scripts would need nonces. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Never embedded in other sites (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  // Photo capture uses the camera on this origin only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  // Ignored on plain HTTP (local dev); enforces HTTPS once served over TLS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Authenticated JSON must never be stored by browsers or shared caches.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The service worker must be re-checked on every load so updates roll out.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
