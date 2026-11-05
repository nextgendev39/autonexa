import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { VehicleFormPage } from "@/components/inventory/vehicle-form-page";
import { requirePagePermission } from "@/lib/auth/authorize";
import { isUuid, vehicleHref } from "@/lib/vehicles/routes";
import { resolveVehicleRef } from "@/lib/vehicles/service";
import { isSoldStatus } from "@/lib/vehicles/status-transitions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("inventory.form.editTitle") };
}

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("vehicle.edit");
  const { id } = await params;

  const vehicle = await resolveVehicleRef(id);
  if (vehicle && isSoldStatus(vehicle.status)) redirect(vehicleHref(vehicle.stockNumber));
  if (vehicle && isUuid(id)) redirect(vehicleHref(vehicle.stockNumber, "/edit"));

  return <VehicleFormPage mode="edit" vehicleId={vehicle?.id ?? id} />;
}
