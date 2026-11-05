import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/auth/authorize";

/** Pricing list is retired — manage pricing on each Inventory vehicle. */
export default async function PricingPage() {
  await requirePagePermission("pricing.view");
  redirect("/inventory");
}
