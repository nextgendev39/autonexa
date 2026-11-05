import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/auth/authorize";

/** Acquisition list is retired — Inventory is the entry point. */
export default async function AcquisitionsPage() {
  await requirePagePermission("acquisition.view");
  redirect("/inventory");
}
