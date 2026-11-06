import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireSite } from "@/lib/storefront/site";
import { SavedScreen } from "@/components/storefront/screens/saved";
import { getLiveView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await requireSite();
  const t = await getTranslations("storefront");
  // Different for every visitor, so there's nothing to index.
  return { title: t("saved.title"), robots: { index: false, follow: true } };
}

/** Saved cars live in the visitor's browser; the page only fetches their public cards. */
export default async function Page() {
  await requireSite();
  return <SavedScreen view={await getLiveView()} />;
}
