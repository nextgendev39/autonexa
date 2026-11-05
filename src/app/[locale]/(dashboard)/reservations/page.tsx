import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/auth/authorize";

/** Reservations list is retired from the main navigation. */
export default async function ReservationsPage() {
  await requirePagePermission("reservation.view");
  redirect("/inventory");
}
