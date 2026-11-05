import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/auth/authorize";

/** New reservation entry is retired from the main navigation. */
export default async function NewReservationPage() {
  await requirePagePermission("reservation.create");
  redirect("/inventory");
}
