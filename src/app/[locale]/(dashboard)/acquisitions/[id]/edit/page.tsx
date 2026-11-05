import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";

/** Acquisition edit is merged into Inventory vehicle edit. */
export default async function EditAcquisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("acquisition.edit");
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("acquisitions")
    .select("vehicle_id")
    .eq("id", id)
    .maybeSingle();

  const vehicleId = (data as { vehicle_id?: string } | null)?.vehicle_id;
  if (vehicleId) {
    redirect(`/inventory/${vehicleId}/edit`);
  }
  redirect("/inventory");
}
