import { siteClient, siteFromRequest } from "@/lib/storefront/site";
import { sitePath } from "@/lib/storefront/host";
import { allListedStockNumbers } from "@/lib/storefront/vehicles";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function GET(request: Request) {
  const site = await siteFromRequest(request);
  if (!site) return new Response("Not found", { status: 404 });

  const base = `https://${site.host}`;
  const entry = (path: string, lastModified?: string) => {
    const links = ["en", "ar"]
      .map(
        (locale) =>
          `<xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(base + sitePath(locale, path, site.defaultLocale))}"/>`,
      )
      .join("");
    return `<url><loc>${escapeXml(base + sitePath(site.defaultLocale, path, site.defaultLocale))}</loc>${links}${lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : ""}</url>`;
  };
  const vehicles = await allListedStockNumbers(siteClient(site));
  const body = [
    entry("/"),
    entry("/vehicles"),
    entry("/contact"),
    ...vehicles.map((v) => entry(`/vehicles/${encodeURIComponent(v.stock_number)}`, v.updated_at)),
  ].join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}
