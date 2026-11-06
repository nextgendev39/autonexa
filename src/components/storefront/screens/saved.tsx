import { getTranslations } from "next-intl/server";

import { SavedVehicles } from "@/components/storefront/device-vehicles";
import type { SiteView } from "@/lib/storefront/view";

/** Saved cars live in the visitor's browser; the page only fetches their public cards. */
export async function SavedScreen({ view }: { view: SiteView }) {
  const t = await getTranslations("storefront");
  const listing = view.href("/vehicles");
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("saved.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("saved.intro")}</p>
      </div>
      <SavedVehicles
        browseHref={listing}
        vehicleBase={listing}
        locale={view.locale}
        currency={view.currency}
        api={view.api}
      />
    </div>
  );
}
