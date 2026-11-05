import { siteFromRequest } from "@/lib/storefront/site";

const text = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });

export async function GET(request: Request) {
  const site = await siteFromRequest(request);
  // A host that isn't a live website has nothing to index.
  if (!site) return text("User-agent: *\nDisallow: /\n");
  return text(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://${site.host}/sitemap.xml\n`);
}
