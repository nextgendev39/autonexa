import "server-only";

import { after } from "next/server";

import { deliverPendingPushes, listActiveUserIds } from "@/lib/notifications/service";
import { tenantClientForUser } from "@/lib/server/privileged";

export const VEHICLE_READY_FOR_SALE = "vehicle_ready_for_sale";
export const VEHICLE_SOLD = "vehicle_sold";

export type VehicleEvent = "ready_for_sale" | "sold";

const TYPES: Record<VehicleEvent, string> = {
  ready_for_sale: VEHICLE_READY_FOR_SALE,
  sold: VEHICLE_SOLD,
};

/**
 * Tells every active user, including whoever acted, that a car is ready for sale or was sold
 * outside a booking, in-app and by push on every browser they subscribed from. Runs after the
 * response so the update isn't held up.
 */
export function alertVehicleEvent(kind: VehicleEvent, vehicleId: string, actorId: string) {
  after(async () => {
    try {
      await createVehicleAlert(kind, vehicleId, actorId);
      await deliverPendingPushes();
    } catch (error) {
      console.error("[vehicles] vehicle alert failed", error);
    }
  });
}

async function createVehicleAlert(kind: VehicleEvent, vehicleId: string, actorId: string) {
  // Runs after the response: the dealership comes from the person who acted.
  const admin = await tenantClientForUser(actorId);
  const [userIds, { data: vehicleRow }, { data: actorRow }] = await Promise.all([
    listActiveUserIds(admin),
    admin
      .from("vehicles")
      .select("stock_number, year, make, model, quantity")
      .eq("id", vehicleId)
      .maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", actorId).maybeSingle(),
  ]);

  const vehicle = vehicleRow as {
    stock_number: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    quantity: number | null;
  } | null;
  // The vehicle may have been rolled back (e.g. a failed acquisition) before this ran.
  if (!vehicle) return;

  const actorName = (actorRow as { display_name: string } | null)?.display_name ?? null;
  const vehicleTitle =
    [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || null;
  const label = vehicleTitle || vehicle.stock_number || "vehicle";
  const stock = vehicle.stock_number ? ` (${vehicle.stock_number})` : "";
  const by = actorName ? ` by ${actorName}` : "";

  const title = kind === "sold" ? "Car sold" : "Ready for sale";
  const message =
    kind === "sold"
      ? `${label}${stock} was sold${by}.`
      : `${label}${stock} is now ready for sale${by}.`;

  const data = {
    vehicleId,
    vehicleTitle,
    stockNumber: vehicle.stock_number,
    actorName,
    units: vehicle.quantity ?? 1,
  };
  if (userIds.length === 0) return;
  const { error } = await admin.from("notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      type: TYPES[kind],
      title,
      message,
      entity_type: "vehicle",
      entity_id: vehicleId,
      data,
    })),
  );
  if (error) console.error("[vehicles] could not save vehicle alert", error.message);
}
