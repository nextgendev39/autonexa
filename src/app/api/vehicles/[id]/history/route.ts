import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { getVehicleActivity, getVehicleStatusHistory } from "@/lib/vehicles/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser("vehicle.view");
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const [statusHistory, activity] = await Promise.all([
    getVehicleStatusHistory(id),
    getVehicleActivity(id),
  ]);

  if (statusHistory.error) {
    return jsonError(statusHistory.error.code, statusHistory.error.message, 400);
  }
  if (activity.error) {
    return jsonError(activity.error.code, activity.error.message, 400);
  }

  return jsonOk({
    statusHistory: statusHistory.data,
    activity: activity.data,
  });
}
