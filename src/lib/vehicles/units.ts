import { currentTenantClient, type TenantClient } from "@/lib/server/privileged";

/** These RPCs take IDs and bypass RLS, so the vehicle must be proven to be in this dealership. */
async function ownVehicle(client: TenantClient, vehicleId: string) {
  const { data } = await client.from("vehicles").select("id").eq("id", vehicleId).maybeSingle();
  return Boolean(data);
}

/**
 * Multi-unit records: moving some units to another status first splits them into their
 * own record (split_vehicle_units), then the status change runs on that record.
 * Callers check permissions before calling; these run with the service role.
 */
export async function splitVehicleUnits(
  vehicleId: string,
  quantity: number,
  userId: string,
): Promise<{ id: string; error: null } | { id: null; error: string }> {
  const client = await currentTenantClient();
  if (!(await ownVehicle(client, vehicleId))) return { id: null, error: "Vehicle not found." };
  const { data, error } = await client.rpc(
    "split_vehicle_units" as never,
    {
      p_vehicle_id: vehicleId,
      p_quantity: quantity,
      p_user_id: userId,
    } as never,
  );
  if (error || !data) return { id: null, error: error?.message ?? "Could not split the units." };
  return { id: data as unknown as string, error: null };
}

/** Puts split units back on their original record when the follow-up step fails. */
export async function undoVehicleSplit(splitId: string) {
  const client = await currentTenantClient();
  if (!(await ownVehicle(client, splitId))) return;
  await client.rpc(
    "undo_vehicle_split" as never,
    { p_new_id: splitId } as never,
  );
}

/**
 * Returns the record to change: the vehicle itself when all units move (or no quantity
 * is given), otherwise a new record holding just the moved units.
 */
export async function recordForUnits(
  vehicle: { id: string; quantity: number },
  quantity: number | undefined,
  userId: string,
): Promise<
  { id: string; split: boolean; error: null } | { id: null; split: false; error: string }
> {
  if (quantity != null && quantity > vehicle.quantity) {
    return { id: null, split: false, error: `Only ${vehicle.quantity} units are available.` };
  }
  if (quantity == null || quantity === vehicle.quantity)
    return { id: vehicle.id, split: false, error: null };
  const result = await splitVehicleUnits(vehicle.id, quantity, userId);
  if (result.error !== null) return { id: null, split: false, error: result.error };
  return { id: result.id, split: true, error: null };
}

/**
 * Merges the Ready for sale records split from the same car back into one (e.g. after a
 * booking on split units is cancelled). Returns the remaining record's id.
 */
export async function mergeReadySplitUnits(vehicleId: string): Promise<string> {
  const client = await currentTenantClient();
  if (!(await ownVehicle(client, vehicleId))) return vehicleId;
  const { data, error } = await client.rpc(
    "merge_ready_split_units" as never,
    { p_vehicle_id: vehicleId } as never,
  );
  if (error) console.error("[vehicles] merge split units failed", error.message);
  return (data as unknown as string | null) ?? vehicleId;
}
