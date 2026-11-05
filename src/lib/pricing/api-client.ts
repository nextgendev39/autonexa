import type {
  PricingListResult,
  VehiclePricingDetail,
} from "@/types/pricing";
import type {
  ApprovePricingValues,
  UpsertPricingValues,
} from "@/lib/validation/pricing";

export type ApiSuccess<T> = { status: "success"; data: T };
export type ApiFailure = {
  status: "error";
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

async function parseJson<T>(response: Response): Promise<ApiResult<T>> {
  const data = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!data || typeof data !== "object") {
    return { status: "error", error: "unknown", message: "Unexpected server response." };
  }
  return data;
}

export async function fetchPricingList(search: string): Promise<ApiResult<PricingListResult>> {
  const response = await fetch(`/api/pricing?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchVehiclePricing(
  vehicleId: string,
): Promise<ApiResult<VehiclePricingDetail>> {
  const response = await fetch(`/api/pricing/${vehicleId}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function upsertPricingRequest(
  vehicleId: string,
  body: UpsertPricingValues,
): Promise<ApiResult<VehiclePricingDetail>> {
  const response = await fetch(`/api/pricing/${vehicleId}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function approvePricingRequest(
  vehicleId: string,
  body: ApprovePricingValues,
): Promise<ApiResult<VehiclePricingDetail>> {
  const response = await fetch(`/api/pricing/${vehicleId}/approve`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}
