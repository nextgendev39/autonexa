import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HomeScreen } from "@/components/storefront/screens/home";
import { getPreviewView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("storefrontAdmin");
  return { title: t("preview") };
}

export default async function Page() {
  return <HomeScreen view={await getPreviewView()} />;
}
