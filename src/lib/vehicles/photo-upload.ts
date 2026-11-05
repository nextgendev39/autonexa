"use client";

import { requireSupabaseEnv } from "@/lib/supabase/env";

export function safePhotoFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "photo.jpg";
}

/** Gallery storage path — category folders are no longer used for new uploads. */
export function buildVehiclePhotoPath(vehicleId: string, fileName: string) {
  return `${vehicleId}/gallery/${crypto.randomUUID()}-${safePhotoFileName(fileName)}`;
}

export async function uploadVehiclePhotoFile(
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
    xhr.open("POST", `${url}/storage/v1/object/vehicle-photos/${path}`);
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

/** Parallel uploads per batch: fast on good connections without saturating mobile ones. */
export const PHOTO_UPLOAD_CONCURRENCY = 4;

/** Runs `task` over `items` with at most `limit` in flight; results keep input order. */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
