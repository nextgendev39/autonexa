import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/auth/authorize";

/** Pricing detail is shown on the Inventory vehicle Pricing tab. */
export default async function PricingDetailPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  await requirePagePermission("pricing.view");
  const { vehicleId } = await params;
  redirect(`/inventory/${vehicleId}?tab=pricing`);
}
