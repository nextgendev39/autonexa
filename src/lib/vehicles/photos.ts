import { planLimitFromError } from "@/lib/platform/limits";
import type { UserContext } from "@/types/auth";
import type { Json } from "@/types/database";
import type { VehicleStatus } from "@/types/vehicle";
import type { VehiclePhoto, VehiclePhotoCategory } from "@/types/vehicle-photo";
import { isSoldStatus } from "@/lib/vehicles/status-transitions";
import { currentTenantClient } from "@/lib/server/privileged";
import { createClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { hasPermission } from "@/lib/permissions";
import type {
  AddVehiclePhotoValues,
  ReorderVehiclePhotosValues,
  UpdateVehiclePhotoValues,
} from "@/lib/validation/vehicle-photo";

export type PhotoServiceError = {
  code: "forbidden" | "not_found" | "validation" | "conflict" | "unknown";
  message: string;
};

export type ServiceResult<T> = {
  data: T | null;
  error: PhotoServiceError | null;
};

type PhotoRow = {
  id: string;
  vehicle_id: string;
  storage_path: string;
  category: VehiclePhotoCategory;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  sort_order: number;
  is_primary: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

const PHOTO_SELECT =
  "id, vehicle_id, storage_path, category, file_name, mime_type, file_size, sort_order, is_primary, uploaded_by, created_at, updated_at";

function canView(context: UserContext) {
  return hasPermission(context.permissions, "vehicle.view", context.roles);
}

function canMutate(context: UserContext) {
  return (
    hasPermission(context.permissions, "vehicle.edit", context.roles) ||
    hasPermission(context.permissions, "vehicle.create", context.roles)
  );
}

/** Users who can create but not edit vehicles (e.g. Accountants) only add photos to cars they created. */
function canEditAnyVehicle(context: UserContext) {
  return hasPermission(context.permissions, "vehicle.edit", context.roles);
}

function mapDbError(error: { message?: string; code?: string }): PhotoServiceError {
  const planLimit = planLimitFromError(error);
  if (planLimit) return { code: "forbidden", message: planLimit.message };
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("not authorized") || message.includes("permission")) {
    return { code: "forbidden", message: "Not authorized." };
  }
  if (message.includes("not found") || error.code === "PGRST116") {
    return { code: "not_found", message: "Photo not found." };
  }
  if (error.code === "23505") {
    return { code: "conflict", message: "A primary photo already exists." };
  }
  return { code: "unknown", message: error.message ?? "Unexpected error." };
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  vehicleId: string,
  oldValues: Json | null,
  newValues: Json | null,
) {
  try {
    await supabase.rpc("write_audit_log", {
      p_action: action,
      p_entity_type: "vehicles",
      p_entity_id: vehicleId,
      p_old_values: oldValues,
      p_new_values: newValues,
      p_metadata: null,
    });
  } catch {
    /* best-effort */
  }
}

async function loadProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  for (const row of data ?? []) {
    const r = row as { id: string; display_name: string | null };
    map.set(r.id, r.display_name ?? r.id);
  }
  return map;
}

function mapPhoto(row: PhotoRow, names: Map<string, string>, url: string | null = null): VehiclePhoto {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    category: row.category,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by ? (names.get(row.uploaded_by) ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url,
  };
}

/** Signs every photo in one Storage request instead of one request per photo. */
async function attachUrls(
  photos: VehiclePhoto[],
): Promise<VehiclePhoto[]> {
  if (photos.length === 0) return photos;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("vehicle-photos").createSignedUrls(
    photos.map((photo) => photo.storagePath),
    60 * 5,
  );
  return photos.map((photo, index) => ({ ...photo, url: data?.[index]?.signedUrl ?? null }));
}

async function assertVehicleAccess(
  vehicleId: string,
  context: UserContext,
  write: boolean,
): Promise<ServiceResult<{ id: string }>> {
  if (write ? !canMutate(context) : !canView(context)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, created_by, status")
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { data: null, error: mapDbError(error) };
  if (!data) return { data: null, error: { code: "not_found", message: "Vehicle not found." } };
  const row = data as { id: string; created_by: string | null; status: VehicleStatus };
  if (write && !canEditAnyVehicle(context) && row.created_by !== context.userId) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  if (write && isSoldStatus(row.status)) {
    return { data: null, error: { code: "conflict", message: "A sold vehicle can no longer be edited." } };
  }
  return { data: { id: row.id }, error: null };
}

/**
 * Split inventory records share photo files (see split_vehicle_units), so a storage
 * object is only removed once no photo row references it any more.
 */
async function removePhotoFileIfUnused(path: string) {
  const admin = (await currentTenantClient());
  const { count } = await admin
    .from("vehicle_photos")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", path);
  if ((count ?? 0) > 0) return { error: null };
  return admin.storage.from("vehicle-photos").remove([path]);
}

export async function listVehiclePhotos(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<VehiclePhoto[]>> {
  const access = await assertVehicleAccess(vehicleId, context, false);
  if (access.error) return { data: null, error: access.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_photos")
    .select(PHOTO_SELECT)
    .eq("vehicle_id", vehicleId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as PhotoRow[];
  const names = await loadProfileNames(
    supabase,
    rows.map((row) => row.uploaded_by),
  );
  const mapped = rows.map((row) => mapPhoto(row, names));
  return { data: await attachUrls(mapped), error: null };
}

export async function getPrimaryPhotoUrls(
  vehicleIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (vehicleIds.length === 0) return result;

  const supabase = await createClient();
  // Prefer primary photo; otherwise first by sort_order (gallery fallback).
  const { data } = await supabase
    .from("vehicle_photos")
    .select("vehicle_id, storage_path, is_primary, sort_order")
    .in("vehicle_id", vehicleIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  const chosen = new Map<string, string>();
  for (const row of (data ?? []) as Array<{
    vehicle_id: string;
    storage_path: string;
  }>) {
    if (!chosen.has(row.vehicle_id)) {
      chosen.set(row.vehicle_id, row.storage_path);
    }
  }

  await Promise.all(
    [...chosen.entries()].map(async ([vehicleId, storagePath]) => {
      const { url } = await createSignedStorageUrl("vehicle-photos", storagePath, 60 * 30);
      result.set(vehicleId, url);
    }),
  );
  return result;
}

export async function addVehiclePhoto(
  vehicleId: string,
  values: AddVehiclePhotoValues,
  context: UserContext,
): Promise<ServiceResult<VehiclePhoto>> {
  const result = await addVehiclePhotos(vehicleId, [values], context);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data![0]!, error: null };
}

/** Saves a batch of already-uploaded photos in a single insert. */
export async function addVehiclePhotos(
  vehicleId: string,
  items: AddVehiclePhotoValues[],
  context: UserContext,
): Promise<ServiceResult<VehiclePhoto[]>> {
  const access = await assertVehicleAccess(vehicleId, context, true);
  if (access.error) return { data: null, error: access.error };

  if (items.some((values) => !values.storagePath.startsWith(`${vehicleId}/`))) {
    return {
      data: null,
      error: { code: "validation", message: "Invalid storage path for vehicle." },
    };
  }

  const supabase = await createClient();

  const [{ data: last }, { data: primary }] = await Promise.all([
    supabase
      .from("vehicle_photos")
      .select("sort_order")
      .eq("vehicle_id", vehicleId)
      .order("sort_order", { ascending: false })
      .limit(1),
    supabase
      .from("vehicle_photos")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("is_primary", true)
      .limit(1),
  ]);

  const maxSort =
    last && last.length > 0 ? Number((last[0] as { sort_order: number }).sort_order) : -1;
  const hasPrimary = (primary?.length ?? 0) > 0;

  // The first photo of a car without a primary becomes primary unless one is requested.
  let primaryIndex = items.findIndex((values) => values.isPrimary);
  if (primaryIndex === -1 && !hasPrimary) primaryIndex = 0;

  if (primaryIndex !== -1 && hasPrimary) {
    await supabase
      .from("vehicle_photos")
      .update({ is_primary: false })
      .eq("vehicle_id", vehicleId)
      .eq("is_primary", true);
  }

  const { data, error } = await supabase
    .from("vehicle_photos")
    .insert(
      items.map((values, index) => ({
        vehicle_id: vehicleId,
        storage_path: values.storagePath,
        category: values.category,
        file_name: values.fileName,
        mime_type: values.mimeType ?? null,
        file_size: values.fileSize ?? null,
        sort_order: values.sortOrder ?? maxSort + 1 + index,
        is_primary: index === primaryIndex,
        uploaded_by: context.userId,
      })),
    )
    .select(PHOTO_SELECT);

  if (error) return { data: null, error: mapDbError(error) };

  const rows = ((data ?? []) as PhotoRow[]).sort((a, b) => a.sort_order - b.sort_order);
  await Promise.all(
    rows.map((row) =>
      writeAudit(supabase, "VEHICLE_IMAGE_UPLOADED", vehicleId, null, {
        photo_id: row.id,
        category: row.category,
        storage_path: row.storage_path,
      }),
    ),
  );

  const names = await loadProfileNames(supabase, [context.userId]);
  return { data: await attachUrls(rows.map((row) => mapPhoto(row, names))), error: null };
}

export async function updateVehiclePhoto(
  vehicleId: string,
  photoId: string,
  values: UpdateVehiclePhotoValues,
  context: UserContext,
): Promise<ServiceResult<VehiclePhoto>> {
  const access = await assertVehicleAccess(vehicleId, context, true);
  if (access.error) return { data: null, error: access.error };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("vehicle_photos")
    .select(PHOTO_SELECT)
    .eq("id", photoId)
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (existingError) return { data: null, error: mapDbError(existingError) };
  if (!existing) return { data: null, error: { code: "not_found", message: "Photo not found." } };

  const old = existing as PhotoRow;

  if (values.isPrimary === true) {
    const { data, error } = await supabase.rpc("set_vehicle_photo_primary", {
      p_photo_id: photoId,
    });
    if (error) return { data: null, error: mapDbError(error) };
    await writeAudit(supabase, "VEHICLE_IMAGE_SET_PRIMARY", vehicleId, {
      photo_id: photoId,
      is_primary: false,
    }, {
      photo_id: photoId,
      is_primary: true,
      category: old.category,
    });
    const row = (Array.isArray(data) ? data[0] : data) as PhotoRow;
    const names = await loadProfileNames(supabase, [row.uploaded_by]);
    const [withUrl] = await attachUrls([mapPhoto(row, names)]);
    return { data: withUrl!, error: null };
  }

  const patch: Record<string, unknown> = {};
  if (values.category != null) patch.category = values.category;
  if (values.sortOrder != null) patch.sort_order = values.sortOrder;
  if (values.storagePath != null) patch.storage_path = values.storagePath;
  if (values.fileName != null) patch.file_name = values.fileName;
  if (values.mimeType !== undefined) patch.mime_type = values.mimeType;
  if (values.fileSize !== undefined) patch.file_size = values.fileSize;
  if (values.isPrimary === false) patch.is_primary = false;

  const replacing = Boolean(values.storagePath && values.storagePath !== old.storage_path);

  const { data, error } = await supabase
    .from("vehicle_photos")
    .update(patch)
    .eq("id", photoId)
    .eq("vehicle_id", vehicleId)
    .select(PHOTO_SELECT)
    .single();

  if (error) return { data: null, error: mapDbError(error) };

  if (replacing) {
    await removePhotoFileIfUnused(old.storage_path);
    await writeAudit(supabase, "VEHICLE_IMAGE_REPLACED", vehicleId, {
      photo_id: photoId,
      storage_path: old.storage_path,
    }, {
      photo_id: photoId,
      storage_path: values.storagePath,
      category: values.category ?? old.category,
    });
  }

  const row = data as PhotoRow;
  const names = await loadProfileNames(supabase, [row.uploaded_by]);
  const [withUrl] = await attachUrls([mapPhoto(row, names)]);
  return { data: withUrl!, error: null };
}

export async function reorderVehiclePhotos(
  vehicleId: string,
  values: ReorderVehiclePhotosValues,
  context: UserContext,
): Promise<ServiceResult<VehiclePhoto[]>> {
  const access = await assertVehicleAccess(vehicleId, context, true);
  if (access.error) return { data: null, error: access.error };

  const supabase = await createClient();
  // sort_order has no unique constraint, so the updates can run in parallel.
  const results = await Promise.all(
    values.orderedIds.map((id, index) =>
      supabase
        .from("vehicle_photos")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("vehicle_id", vehicleId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { data: null, error: mapDbError(failed.error) };

  await writeAudit(supabase, "VEHICLE_IMAGE_REORDERED", vehicleId, null, {
    ordered_ids: values.orderedIds,
  });

  return listVehiclePhotos(vehicleId, context);
}

export async function deleteVehiclePhoto(
  vehicleId: string,
  photoId: string,
  context: UserContext,
): Promise<ServiceResult<{ id: string }>> {
  const result = await deleteVehiclePhotos(vehicleId, [photoId], context);
  if (result.error) return { data: null, error: result.error };
  return { data: { id: photoId }, error: null };
}

/** Deletes several photos of one vehicle in a single pass (multi-select delete). */
export async function deleteVehiclePhotos(
  vehicleId: string,
  photoIds: string[],
  context: UserContext,
): Promise<ServiceResult<{ ids: string[] }>> {
  const access = await assertVehicleAccess(vehicleId, context, true);
  if (access.error) return { data: null, error: access.error };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("vehicle_photos")
    .select(PHOTO_SELECT)
    .eq("vehicle_id", vehicleId)
    .in("id", photoIds);

  if (existingError) return { data: null, error: mapDbError(existingError) };
  const rows = (existing ?? []) as PhotoRow[];
  if (rows.length === 0) {
    return { data: null, error: { code: "not_found", message: "Photo not found." } };
  }

  const ids = rows.map((row) => row.id);
  const { error: deleteError } = await supabase
    .from("vehicle_photos")
    .delete()
    .eq("vehicle_id", vehicleId)
    .in("id", ids);

  if (deleteError) return { data: null, error: mapDbError(deleteError) };

  // Split inventory records share files (see removePhotoFileIfUnused): keep any still referenced.
  const admin = (await currentTenantClient());
  const paths = [...new Set(rows.map((row) => row.storage_path))];
  const { data: stillUsed } = await admin
    .from("vehicle_photos")
    .select("storage_path")
    .in("storage_path", paths);
  const usedPaths = new Set(
    ((stillUsed ?? []) as Array<{ storage_path: string }>).map((row) => row.storage_path),
  );
  const unused = paths.filter((path) => !usedPaths.has(path));
  const { error: storageError } =
    unused.length > 0
      ? await admin.storage.from("vehicle-photos").remove(unused)
      : { error: null };

  if (storageError) {
    return {
      data: null,
      error: {
        code: "unknown",
        message: storageError.message || "Photo record removed but storage delete failed.",
      },
    };
  }

  if (rows.some((row) => row.is_primary)) {
    const { data: next } = await supabase
      .from("vehicle_photos")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase.rpc("set_vehicle_photo_primary", {
        p_photo_id: (next as { id: string }).id,
      });
    }
  }

  await Promise.all(
    rows.map((row) =>
      writeAudit(supabase, "VEHICLE_IMAGE_DELETED", vehicleId, {
        photo_id: row.id,
        category: row.category,
        storage_path: row.storage_path,
      }, null),
    ),
  );

  return { data: { ids }, error: null };
}
