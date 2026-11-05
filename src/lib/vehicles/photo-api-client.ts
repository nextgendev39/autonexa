import type { VehiclePhoto } from "@/types/vehicle-photo";
import type {
  AddVehiclePhotoValues,
  DeleteVehiclePhotosValues,
  ReorderVehiclePhotosValues,
  UpdateVehiclePhotoValues,
} from "@/lib/validation/vehicle-photo";
import type { ApiResult } from "@/lib/vehicles/api-client";

async function parseJson<T>(response: Response): Promise<ApiResult<T>> {
  const data = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!data || typeof data !== "object") {
    return { status: "error", error: "unknown", message: "Unexpected server response." };
  }
  return data;
}

export async function fetchVehiclePhotos(
  vehicleId: string,
): Promise<ApiResult<VehiclePhoto[]>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function addVehiclePhotoRequest(
  vehicleId: string,
  body: AddVehiclePhotoValues,
): Promise<ApiResult<VehiclePhoto>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function addVehiclePhotosRequest(
  vehicleId: string,
  photos: AddVehiclePhotoValues[],
): Promise<ApiResult<VehiclePhoto[]>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ photos }),
  });
  return parseJson(response);
}

export async function updateVehiclePhotoRequest(
  vehicleId: string,
  photoId: string,
  body: UpdateVehiclePhotoValues,
): Promise<ApiResult<VehiclePhoto>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos/${photoId}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function deleteVehiclePhotoRequest(
  vehicleId: string,
  photoId: string,
): Promise<ApiResult<{ id: string }>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos/${photoId}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function deleteVehiclePhotosRequest(
  vehicleId: string,
  body: DeleteVehiclePhotosValues,
): Promise<ApiResult<{ ids: string[] }>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos/delete`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function reorderVehiclePhotosRequest(
  vehicleId: string,
  body: ReorderVehiclePhotosValues,
): Promise<ApiResult<VehiclePhoto[]>> {
  const response = await fetch(`/api/vehicles/${vehicleId}/photos/reorder`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}
