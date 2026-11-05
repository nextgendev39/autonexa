import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { VehicleCatalogManager } from "@/components/vehicle-catalog/vehicle-catalog-manager";
import { requirePagePermission } from "@/lib/auth/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("settings.catalog.title") };
}

export default async function Page() {
  await requirePagePermission("settings.manage");
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("settings.catalog.title")}
        description={t("settings.catalog.description")}
      />
      <VehicleCatalogManager />
    </div>
  );
}
