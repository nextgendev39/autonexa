import { createClient } from "@/lib/supabase/server";

const DEFAULT_EXPIRES_IN = 60 * 5; // 5 minutes

export type StorageBucket =
  | "vehicle-photos"
  | "vehicle-documents"
  | "workshop-photos"
  | "customer-documents"
  | "sales-documents";

/**
 * Build a predictable private object path.
 * Example: vehicles/{id}/photos/{uuid}-file.jpg is enforced in docs;
 * bucket policies expect `{entity_id}/{filename}`.
 */
export function buildStoragePath(entityId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = crypto.randomUUID();
  return `${entityId}/${unique}-${safeName}`;
}

/**
 * Create a short-lived signed URL after Storage RLS has already authorized the object.
 */
export async function createSignedStorageUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn = DEFAULT_EXPIRES_IN,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    return { url: null as string | null, error: error?.message ?? "Unable to sign URL" };
  }
  return { url: data.signedUrl, error: null as string | null };
}
