import type {
  VehicleDetail,
  VehicleListResult,
  BranchOption,
  LocationOption,
  MakeOption,
  ModelOption,
  CatalogModel,
  CatalogModelYear,
  CatalogVariant,
  VehicleActivityItem,
  VehicleStatusHistoryItem,
} from "@/types/vehicle";
import type {
  ArchiveVehicleValues,
  ChangeVehicleStatusValues,
  CreateVehicleValues,
  MarkReadyForSaleValues,
  TransferVehicleValues,
  UpdateVehicleValues,
} from "@/lib/validation/vehicle";
import type { ReadyForSaleEligibility } from "@/types/ready-for-sale";

export type ApiSuccess<T> = { status: "success"; data: T };
export type ApiFailure = {
  status: "error";
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  details?: { existingVehicleId?: string; blockers?: unknown };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

async function parseJson<T>(response: Response): Promise<ApiResult<T>> {
  const data = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!data || typeof data !== "object") {
    return { status: "error", error: "unknown", message: "Unexpected server response." };
  }
  return data;
}

export async function fetchVehicles(search: string): Promise<ApiResult<VehicleListResult>> {
  const response = await fetch(`/api/vehicles?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchVehicle(id: string): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch(`/api/vehicles/${id}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function createVehicleRequest(
  body: CreateVehicleValues,
): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch("/api/vehicles", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function updateVehicleRequest(
  id: string,
  body: UpdateVehicleValues,
): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch(`/api/vehicles/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function changeStatusRequest(
  id: string,
  body: ChangeVehicleStatusValues,
): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch(`/api/vehicles/${id}/status`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function transferVehicleRequest(
  id: string,
  body: TransferVehicleValues,
): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch(`/api/vehicles/${id}/transfer`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function archiveVehicleRequest(
  id: string,
  body: ArchiveVehicleValues,
): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch(`/api/vehicles/${id}/archive`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function fetchReadyForSaleEligibility(
  id: string,
): Promise<ApiResult<ReadyForSaleEligibility>> {
  const response = await fetch(`/api/vehicles/${id}/ready-for-sale`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function markReadyForSaleRequest(
  id: string,
  body: MarkReadyForSaleValues,
): Promise<ApiResult<VehicleDetail>> {
  const response = await fetch(`/api/vehicles/${id}/ready-for-sale`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function fetchVehicleHistory(id: string): Promise<
  ApiResult<{
    statusHistory: VehicleStatusHistoryItem[];
    activity: VehicleActivityItem[];
  }>
> {
  const response = await fetch(`/api/vehicles/${id}/history`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchInventoryMeta(params?: {
  branchId?: string;
  makeId?: string;
}): Promise<
  ApiResult<{
    branches: BranchOption[];
    locations: LocationOption[];
    makes: MakeOption[];
    models: ModelOption[];
  }>
> {
  const search = new URLSearchParams();
  if (params?.branchId) search.set("branchId", params.branchId);
  if (params?.makeId) search.set("makeId", params.makeId);
  const response = await fetch(`/api/inventory/meta?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchCatalogModels(makeId: string): Promise<ApiResult<CatalogModel[]>> {
  const search = new URLSearchParams({ makeId });
  const response = await fetch(`/api/inventory/catalog/models?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchCatalogYears(modelId: string): Promise<ApiResult<CatalogModelYear[]>> {
  const search = new URLSearchParams({ modelId });
  const response = await fetch(`/api/inventory/catalog/years?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchCatalogVariants(
  modelYearId: string,
): Promise<ApiResult<CatalogVariant[]>> {
  const search = new URLSearchParams({ modelYearId });
  const response = await fetch(`/api/inventory/catalog/variants?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}
