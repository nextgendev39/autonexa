import type { Metadata } from "next";

import { SiteMotion } from "@/components/storefront/reveal";
import { SiteShell } from "@/components/storefront/site-shell";
import { getPreviewView } from "@/lib/storefront/view";
import { listingFacets } from "@/lib/storefront/vehicles";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The whole website, as visitors will see it once published, for the signed-in dealership:
 * its saved draft design and the cars it has listed. Every page and filter works here.
 */
export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  const view = await getPreviewView();
  const facets = await listingFacets(view.client);
  return (
    <SiteMotion>
      <SiteShell
        name={view.name}
        config={view.config}
        href={view.href}
        switchHref={view.switchHref("/")}
        facets={facets}
        api={view.api}
      >
        {children}
      </SiteShell>
    </SiteMotion>
  );
}
