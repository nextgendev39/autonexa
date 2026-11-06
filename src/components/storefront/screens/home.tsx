import { StorefrontHome } from "@/components/storefront/site-sections";
import type { SiteView } from "@/lib/storefront/view";
import { featuredVehicles, latestVehicles, listingFacets } from "@/lib/storefront/vehicles";

export async function HomeScreen({ view }: { view: SiteView }) {
  const { client } = view;
  const [featured, latest, newCars, usedCars, facets] = await Promise.all([
    featuredVehicles(client, view.config.featuredStockNumbers),
    latestVehicles(client, 8),
    latestVehicles(client, 4, "new"),
    latestVehicles(client, 4, "used"),
    listingFacets(client),
  ]);
  await view.track("page_view", { path: "/" });
  return (
    <StorefrontHome
      name={view.name}
      locale={view.locale}
      currency={view.currency}
      config={view.config}
      featured={featured}
      latest={latest}
      newCars={newCars}
      usedCars={usedCars}
      facets={facets}
      href={view.href}
      api={view.api}
    />
  );
}
