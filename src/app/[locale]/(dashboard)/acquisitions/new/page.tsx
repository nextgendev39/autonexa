import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requirePagePermission } from "@/lib/auth/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.inventoryNew.title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acquisition onboarding is merged into Inventory.
 * Preserve deep links: ?vehicleId= → edit that vehicle; otherwise → add vehicle.
 */
export default async function NewAcquisitionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("acquisition.create");

  const params = await searchParams;
  const raw = params.vehicleId;
  const vehicleId = typeof raw === "string" && UUID.test(raw) ? raw : undefined;

  if (vehicleId) {
    redirect(`/inventory/${vehicleId}/edit`);
  }
  redirect("/inventory/new");
}
