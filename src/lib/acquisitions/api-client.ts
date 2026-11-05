import type {
  AcquisitionDetail,
  AcquisitionExpense,
  AcquisitionListResult,
  AcquisitionMeta,
  AcquisitionStatusHistoryItem,
  AcquisitionActivityItem,
} from "@/types/acquisition";
import type {
  AcquisitionExpenseValues,
  ApproveAcquisitionValues,
  CancelAcquisitionValues,
  ChangeAcquisitionStatusValues,
  CreateAcquisitionValues,
  ReceiveAcquisitionValues,
  RejectAcquisitionValues,
  UpdateAcquisitionValues,
} from "@/lib/validation/acquisition";

export type ApiSuccess<T> = { status: "success"; data: T };
export type ApiFailure = {
  status: "error";
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  details?: { existingVehicleId?: string; existingAcquisitionId?: string };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

async function parseJson<T>(response: Response): Promise<ApiResult<T>> {
  const data = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!data || typeof data !== "object") {
    return { status: "error", error: "unknown", message: "Unexpected server response." };
  }
  return data;
}

export async function fetchAcquisitions(search: string): Promise<ApiResult<AcquisitionListResult>> {
  const response = await fetch(`/api/acquisitions?${search}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchAcquisition(id: string): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchAcquisitionHistory(
  id: string,
): Promise<ApiResult<AcquisitionStatusHistoryItem[]>> {
  const response = await fetch(`/api/acquisitions/${id}/history`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchAcquisitionActivity(
  id: string,
): Promise<ApiResult<AcquisitionActivityItem[]>> {
  const response = await fetch(`/api/acquisitions/${id}/activity`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function fetchAcquisitionMeta(params?: {
  branchId?: string;
  makeId?: string;
}): Promise<ApiResult<AcquisitionMeta>> {
  const search = new URLSearchParams();
  if (params?.branchId) search.set("branchId", params.branchId);
  if (params?.makeId) search.set("makeId", params.makeId);
  const qs = search.toString();
  const response = await fetch(`/api/acquisitions/meta${qs ? `?${qs}` : ""}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function createAcquisitionRequest(
  body: CreateAcquisitionValues,
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch("/api/acquisitions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function updateAcquisitionRequest(
  id: string,
  body: UpdateAcquisitionValues,
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function changeAcquisitionStatusRequest(
  id: string,
  body: ChangeAcquisitionStatusValues,
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}/status`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function approveAcquisitionRequest(
  id: string,
  body: ApproveAcquisitionValues,
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}/approve`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function rejectAcquisitionRequest(
  id: string,
  body: RejectAcquisitionValues,
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}/reject`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function cancelAcquisitionRequest(
  id: string,
  body: CancelAcquisitionValues,
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}/cancel`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function receiveAcquisitionRequest(
  id: string,
  body: ReceiveAcquisitionValues = { reason: null },
): Promise<ApiResult<AcquisitionDetail>> {
  const response = await fetch(`/api/acquisitions/${id}/receive`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function addExpenseRequest(
  id: string,
  body: AcquisitionExpenseValues,
): Promise<ApiResult<AcquisitionExpense>> {
  const response = await fetch(`/api/acquisitions/${id}/expenses`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function updateExpenseRequest(
  id: string,
  expenseId: string,
  body: Partial<AcquisitionExpenseValues>,
): Promise<ApiResult<AcquisitionExpense>> {
  const response = await fetch(`/api/acquisitions/${id}/expenses/${expenseId}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function removeExpenseRequest(
  id: string,
  expenseId: string,
): Promise<ApiResult<{ id: string }>> {
  const response = await fetch(`/api/acquisitions/${id}/expenses/${expenseId}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}
