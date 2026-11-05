"use client";

import { requireSupabaseEnv } from "@/lib/supabase/env";
import type { AcquisitionDocumentCategory } from "@/types/acquisition-document";

export function safeDocumentFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "document.pdf";
}

/** Path must start with vehicleId for storage RLS (storage_entity_id). */
export function buildAcquisitionDocumentPath(
  vehicleId: string,
  acquisitionId: string,
  category: AcquisitionDocumentCategory,
  fileName: string,
) {
  return `${vehicleId}/${acquisitionId}/${category}/${crypto.randomUUID()}-${safeDocumentFileName(fileName)}`;
}

export async function uploadAcquisitionDocumentFile(
  file: File,
  path: string,
  onProgress?: (percent: number) => void,
) {
  // Loaded on first upload: keeps the Supabase client out of the page bundle.
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { url, key } = requireSupabaseEnv();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Authentication required.");
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/vehicle-documents/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(Math.round((event.loaded / event.total) * 90));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(90);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message || body.error || message;
      } catch {
        // keep default
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}
