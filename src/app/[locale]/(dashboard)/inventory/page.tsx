import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { InventoryPageClient } from "@/components/inventory/inventory-page-client";
import { InventoryListSkeleton } from "@/components/feedback/skeletons";
import { requirePagePermission } from "@/lib/auth/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.inventory.title") };
}

export default async function Page() {
  await requirePagePermission("vehicle.view");

  return (
    <Suspense fallback={<InventoryListSkeleton />}>
      <InventoryPageClient />
    </Suspense>
  );
}
