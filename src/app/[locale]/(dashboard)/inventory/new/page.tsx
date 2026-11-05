import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { VehicleFormPage } from "@/components/inventory/vehicle-form-page";
import { requirePagePermission } from "@/lib/auth/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.inventoryNew.title") };
}

export default async function NewVehiclePage() {
  await requirePagePermission("vehicle.create");

  return <VehicleFormPage mode="create" />;
}
