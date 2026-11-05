import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { VehicleDetailClient } from "@/components/inventory/vehicle-detail-client";
import { requirePagePermission } from "@/lib/auth/authorize";
import { isUuid, vehicleHref } from "@/lib/vehicles/routes";
import { resolveVehicleRef } from "@/lib/vehicles/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.inventory.title") };
}

const VEHICLE_TABS = new Set([
  "overview",
  "acquisition",
  "pricing",
  "photos",
  "documents",
  "history",
]);

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("vehicle.view");
  const { id } = await params;
  const query = await searchParams;
  const rawTab = query.tab;
  const tab =
    typeof rawTab === "string" && VEHICLE_TABS.has(rawTab) ? rawTab : undefined;

  const vehicle = await resolveVehicleRef(id);
  // Old UUID links land on the canonical stock-number URL.
  if (vehicle && isUuid(id)) redirect(vehicleHref(vehicle.stockNumber, "", tab));

  // Unresolved refs fall through so the client shows its not-found state.
  return <VehicleDetailClient vehicleId={vehicle?.id ?? id} initialTab={tab} />;
}
