import type { AcquisitionDocument } from "@/types/acquisition-document";
import type {
  AddAcquisitionDocumentValues,
  ReplaceAcquisitionDocumentValues,
  UpdateAcquisitionDocumentMetaValues,
} from "@/lib/validation/acquisition-document";
import type { ApiResult } from "@/lib/acquisitions/api-client";

async function parseJson<T>(response: Response): Promise<ApiResult<T>> {
  const data = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!data || typeof data !== "object") {
    return { status: "error", error: "unknown", message: "Unexpected server response." };
  }
  return data;
}

export async function fetchAcquisitionDocuments(
  acquisitionId: string,
): Promise<ApiResult<AcquisitionDocument[]>> {
  const response = await fetch(`/api/acquisitions/${acquisitionId}/documents`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseJson(response);
}

export async function addAcquisitionDocumentRequest(
  acquisitionId: string,
  body: AddAcquisitionDocumentValues,
): Promise<ApiResult<AcquisitionDocument>> {
  const response = await fetch(`/api/acquisitions/${acquisitionId}/documents`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response);
}

export async function replaceAcquisitionDocumentRequest(
  acquisitionId: string,
  documentId: string,
  body: ReplaceAcquisitionDocumentValues,
): Promise<ApiResult<AcquisitionDocument>> {
  const response = await fetch(
    `/api/acquisitions/${acquisitionId}/documents/${documentId}`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
  );
  return parseJson(response);
}

export async function updateAcquisitionDocumentRequest(
  acquisitionId: string,
  documentId: string,
  body: UpdateAcquisitionDocumentMetaValues,
): Promise<ApiResult<AcquisitionDocument>> {
  const response = await fetch(
    `/api/acquisitions/${acquisitionId}/documents/${documentId}`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
  );
  return parseJson(response);
}

export async function deleteAcquisitionDocumentRequest(
  acquisitionId: string,
  documentId: string,
): Promise<ApiResult<{ id: string }>> {
  const response = await fetch(
    `/api/acquisitions/${acquisitionId}/documents/${documentId}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  return parseJson(response);
}
