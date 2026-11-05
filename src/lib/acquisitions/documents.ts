import type { UserContext } from "@/types/auth";
import type { Json } from "@/types/database";
import type {
  AcquisitionDocument,
  AcquisitionDocumentCategory,
} from "@/types/acquisition-document";
import { ACQUISITION_DOCUMENT_CATEGORIES } from "@/types/acquisition-document";
import { createClient } from "@/lib/supabase/server";
import { createSignedStorageUrl } from "@/lib/storage/signed-url";
import { hasPermission } from "@/lib/permissions";
import type {
  AddAcquisitionDocumentValues,
  ReplaceAcquisitionDocumentValues,
  UpdateAcquisitionDocumentMetaValues,
} from "@/lib/validation/acquisition-document";

export type DocumentServiceError = {
  code: "forbidden" | "not_found" | "validation" | "conflict" | "unknown";
  message: string;
};

export type ServiceResult<T> = {
  data: T | null;
  error: DocumentServiceError | null;
};

type DocRow = {
  id: string;
  document_type_id: string;
  entity_type: string;
  entity_id: string;
  branch_id: string | null;
  storage_path: string;
  file_name: string;
  title: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  reference_number: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  document_types?: { key: string; name: string } | { key: string; name: string }[] | null;
};

type AcquisitionAccess = {
  id: string;
  vehicleId: string;
  branchId: string;
};

const DOC_SELECT =
  "id, document_type_id, entity_type, entity_id, branch_id, storage_path, file_name, title, original_file_name, mime_type, file_size, reference_number, notes, uploaded_by, created_at, updated_at, document_types:document_type_id ( key, name )";

const CATEGORY_SET = new Set<string>(ACQUISITION_DOCUMENT_CATEGORIES);

function canView(context: UserContext) {
  return (
    hasPermission(context.permissions, "document.view", context.roles) ||
    hasPermission(context.permissions, "acquisition.view", context.roles)
  );
}

function canCreate(context: UserContext) {
  return hasPermission(context.permissions, "document.create", context.roles);
}

function canEdit(context: UserContext) {
  return hasPermission(context.permissions, "document.edit", context.roles);
}

/** Soft-delete / replace: document.edit or document.create (matches RLS). */
function canMutateDocument(context: UserContext) {
  return canEdit(context) || canCreate(context);
}

function asRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapDbError(error: { message?: string; code?: string }): DocumentServiceError {
  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("not authorized") ||
    message.includes("permission") ||
    message.includes("row-level security")
  ) {
    return { code: "forbidden", message: "Not authorized to modify this document." };
  }
  if (message.includes("not found") || error.code === "PGRST116") {
    return { code: "not_found", message: "Document not found." };
  }
  if (error.code === "23505") {
    return { code: "conflict", message: "Document already exists." };
  }
  return { code: "unknown", message: error.message ?? "Unexpected error." };
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  acquisitionId: string,
  oldValues: Json | null,
  newValues: Json | null,
) {
  try {
    await supabase.rpc("write_audit_log", {
      p_action: action,
      p_entity_type: "acquisitions",
      p_entity_id: acquisitionId,
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

function mapDocument(
  row: DocRow,
  vehicleId: string,
  names: Map<string, string>,
  url: string | null = null,
): AcquisitionDocument {
  const type = asRelation(row.document_types);
  const category = type?.key ?? "other";
  const title =
    row.title?.trim() ||
    type?.name ||
    row.original_file_name ||
    row.file_name ||
    "Document";

  return {
    id: row.id,
    acquisitionId: row.entity_id,
    vehicleId,
    branchId: row.branch_id,
    category: CATEGORY_SET.has(category)
      ? (category as AcquisitionDocumentCategory)
      : category,
    categoryLabel: type?.name ?? "Other",
    title,
    fileName: row.original_file_name || row.file_name,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    referenceNumber: row.reference_number,
    notes: row.notes,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by ? (names.get(row.uploaded_by) ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url,
  };
}

async function attachUrls(
  docs: AcquisitionDocument[],
): Promise<AcquisitionDocument[]> {
  return Promise.all(
    docs.map(async (doc) => {
      const { url } = await createSignedStorageUrl("vehicle-documents", doc.storagePath);
      return { ...doc, url };
    }),
  );
}

async function assertAcquisitionAccess(
  acquisitionId: string,
  context: UserContext,
  write: "view" | "create" | "edit" | "mutate",
): Promise<ServiceResult<AcquisitionAccess>> {
  if (write === "view" && !canView(context)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  if (write === "create" && !canCreate(context)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  if (write === "edit" && !canEdit(context)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  if (write === "mutate" && !canMutateDocument(context)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisitions")
    .select("id, vehicle_id, branch_id")
    .eq("id", acquisitionId)
    .maybeSingle();

  if (error) return { data: null, error: mapDbError(error) };
  if (!data) {
    return { data: null, error: { code: "not_found", message: "Acquisition not found." } };
  }

  const row = data as { id: string; vehicle_id: string; branch_id: string };
  return {
    data: { id: row.id, vehicleId: row.vehicle_id, branchId: row.branch_id },
    error: null,
  };
}

async function resolveDocumentTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  category: string,
): Promise<ServiceResult<string>> {
  const { data, error } = await supabase
    .from("document_types")
    .select("id")
    .eq("key", category)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { data: null, error: mapDbError(error) };
  if (!data) {
    return {
      data: null,
      error: { code: "validation", message: "Unknown document category." },
    };
  }
  return { data: (data as { id: string }).id, error: null };
}

function validateStoragePath(
  path: string,
  vehicleId: string,
  acquisitionId: string,
): DocumentServiceError | null {
  const expectedPrefix = `${vehicleId}/${acquisitionId}/`;
  if (!path.startsWith(expectedPrefix)) {
    return { code: "validation", message: "Invalid storage path for acquisition." };
  }
  return null;
}

export async function listAcquisitionDocuments(
  acquisitionId: string,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDocument[]>> {
  const access = await assertAcquisitionAccess(acquisitionId, context, "view");
  if (access.error || !access.data) return { data: null, error: access.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("entity_type", "acquisitions")
    .eq("entity_id", acquisitionId)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as DocRow[];
  const names = await loadProfileNames(
    supabase,
    rows.map((row) => row.uploaded_by),
  );
  const mapped = rows.map((row) => mapDocument(row, access.data!.vehicleId, names));
  return { data: await attachUrls(mapped), error: null };
}

export async function uploadAcquisitionDocument(
  acquisitionId: string,
  values: AddAcquisitionDocumentValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDocument>> {
  const access = await assertAcquisitionAccess(acquisitionId, context, "create");
  if (access.error || !access.data) return { data: null, error: access.error };

  const pathError = validateStoragePath(
    values.storagePath,
    access.data.vehicleId,
    acquisitionId,
  );
  if (pathError) return { data: null, error: pathError };

  const supabase = await createClient();

  // Idempotency: if the same storage path already exists, return it.
  const { data: existing } = await supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("entity_type", "acquisitions")
    .eq("entity_id", acquisitionId)
    .eq("storage_path", values.storagePath)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const row = existing as DocRow;
    const names = await loadProfileNames(supabase, [row.uploaded_by]);
    const [withUrl] = await attachUrls([mapDocument(row, access.data.vehicleId, names)]);
    return { data: withUrl!, error: null };
  }

  const typeId = await resolveDocumentTypeId(supabase, values.category);
  if (typeId.error || !typeId.data) return { data: null, error: typeId.error };

  const title =
    values.title?.trim() ||
    null;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      document_type_id: typeId.data,
      entity_type: "acquisitions",
      entity_id: acquisitionId,
      branch_id: access.data.branchId,
      storage_path: values.storagePath,
      file_name: values.fileName,
      title,
      original_file_name: values.originalFileName ?? values.fileName,
      mime_type: values.mimeType ?? null,
      file_size: values.fileSize ?? null,
      reference_number: values.referenceNumber?.trim() || null,
      notes: values.notes?.trim() || null,
      uploaded_by: context.userId,
      status: "active",
    })
    .select(DOC_SELECT)
    .single();

  if (error) return { data: null, error: mapDbError(error) };

  const row = data as DocRow;
  await writeAudit(supabase, "ACQUISITION_DOCUMENT_UPLOADED", acquisitionId, null, {
    document_id: row.id,
    vehicle_id: access.data.vehicleId,
    category: values.category,
    storage_path: row.storage_path,
  });

  const names = await loadProfileNames(supabase, [row.uploaded_by]);
  const [withUrl] = await attachUrls([mapDocument(row, access.data.vehicleId, names)]);
  return { data: withUrl!, error: null };
}

export async function replaceAcquisitionDocument(
  acquisitionId: string,
  documentId: string,
  values: ReplaceAcquisitionDocumentValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDocument>> {
  const access = await assertAcquisitionAccess(acquisitionId, context, "mutate");
  if (access.error || !access.data) return { data: null, error: access.error };

  const pathError = validateStoragePath(
    values.storagePath,
    access.data.vehicleId,
    acquisitionId,
  );
  if (pathError) return { data: null, error: pathError };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("id", documentId)
    .eq("entity_type", "acquisitions")
    .eq("entity_id", acquisitionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) return { data: null, error: mapDbError(existingError) };
  if (!existing) {
    return { data: null, error: { code: "not_found", message: "Document not found." } };
  }

  const old = existing as DocRow;
  if (values.storagePath === old.storage_path) {
    return {
      data: null,
      error: { code: "validation", message: "Replacement file path must be unique." },
    };
  }

  const patch: Record<string, unknown> = {
    storage_path: values.storagePath,
    file_name: values.fileName,
    original_file_name: values.originalFileName ?? values.fileName,
    mime_type: values.mimeType ?? null,
    file_size: values.fileSize ?? null,
  };
  if (values.title !== undefined) patch.title = values.title?.trim() || null;
  if (values.referenceNumber !== undefined) {
    patch.reference_number = values.referenceNumber?.trim() || null;
  }
  if (values.notes !== undefined) patch.notes = values.notes?.trim() || null;

  const { data, error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId)
    .eq("entity_id", acquisitionId)
    .select(DOC_SELECT)
    .single();

  if (error) return { data: null, error: mapDbError(error) };

  // Only remove the old object after the DB update succeeded.
  const { error: storageError } = await supabase.storage
    .from("vehicle-documents")
    .remove([old.storage_path]);

  if (storageError) {
    // Roll forward with new file; surface warning-like unknown so client can retry cleanup.
    // Keep new record — old orphan is preferable to losing the replacement.
  }

  await writeAudit(
    supabase,
    "ACQUISITION_DOCUMENT_REPLACED",
    acquisitionId,
    {
      document_id: documentId,
      vehicle_id: access.data.vehicleId,
      storage_path: old.storage_path,
    },
    {
      document_id: documentId,
      vehicle_id: access.data.vehicleId,
      storage_path: values.storagePath,
    },
  );

  const row = data as DocRow;
  const names = await loadProfileNames(supabase, [row.uploaded_by]);
  const [withUrl] = await attachUrls([mapDocument(row, access.data.vehicleId, names)]);
  return { data: withUrl!, error: null };
}

export async function updateAcquisitionDocumentMeta(
  acquisitionId: string,
  documentId: string,
  values: UpdateAcquisitionDocumentMetaValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDocument>> {
  const access = await assertAcquisitionAccess(acquisitionId, context, "mutate");
  if (access.error || !access.data) return { data: null, error: access.error };

  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (values.title !== undefined) patch.title = values.title?.trim() || null;
  if (values.referenceNumber !== undefined) {
    patch.reference_number = values.referenceNumber?.trim() || null;
  }
  if (values.notes !== undefined) patch.notes = values.notes?.trim() || null;
  if (values.category) {
    const typeId = await resolveDocumentTypeId(supabase, values.category);
    if (typeId.error || !typeId.data) return { data: null, error: typeId.error };
    patch.document_type_id = typeId.data;
  }

  const { data, error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId)
    .eq("entity_type", "acquisitions")
    .eq("entity_id", acquisitionId)
    .is("deleted_at", null)
    .select(DOC_SELECT)
    .single();

  if (error) return { data: null, error: mapDbError(error) };

  const row = data as DocRow;
  const names = await loadProfileNames(supabase, [row.uploaded_by]);
  const [withUrl] = await attachUrls([mapDocument(row, access.data.vehicleId, names)]);
  return { data: withUrl!, error: null };
}

export async function deleteAcquisitionDocument(
  acquisitionId: string,
  documentId: string,
  context: UserContext,
): Promise<ServiceResult<{ id: string }>> {
  const access = await assertAcquisitionAccess(acquisitionId, context, "mutate");
  if (access.error || !access.data) return { data: null, error: access.error };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("id", documentId)
    .eq("entity_type", "acquisitions")
    .eq("entity_id", acquisitionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) return { data: null, error: mapDbError(existingError) };
  if (!existing) {
    return { data: null, error: { code: "not_found", message: "Document not found." } };
  }

  const row = existing as DocRow;

  // Soft-delete DB first. Do NOT .select() afterward — documents_select requires
  // deleted_at is null, which makes RETURNING fail with an RLS "new row" error.
  const { error: deleteError, count } = await supabase
    .from("documents")
    .update(
      {
        deleted_at: new Date().toISOString(),
        deleted_by: context.userId,
        status: "archived",
      },
      { count: "exact" },
    )
    .eq("id", documentId)
    .eq("entity_type", "acquisitions")
    .eq("entity_id", acquisitionId)
    .is("deleted_at", null);

  if (deleteError) return { data: null, error: mapDbError(deleteError) };
  if ((count ?? 0) === 0) {
    return { data: null, error: { code: "not_found", message: "Document not found." } };
  }

  // Then remove storage object. If this fails, leave soft-deleted row and ask to retry.
  const { error: storageError } = await supabase.storage
    .from("vehicle-documents")
    .remove([row.storage_path]);

  if (storageError) {
    return {
      data: null,
      error: {
        code: "unknown",
        message: storageError.message || "Document removed, but file cleanup failed. Please retry.",
      },
    };
  }

  const type = asRelation(row.document_types);
  await writeAudit(supabase, "ACQUISITION_DOCUMENT_DELETED", acquisitionId, {
    document_id: documentId,
    vehicle_id: access.data.vehicleId,
    category: type?.key ?? null,
    storage_path: row.storage_path,
  }, null);

  return { data: { id: documentId }, error: null };
}
