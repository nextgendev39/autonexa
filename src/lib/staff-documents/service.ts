import "server-only";

import { checkPlanLimit } from "@/lib/platform/limits";
import { tenantClient } from "@/lib/server/privileged";
import {
  EXPIRY_WARNING_DAYS,
  validateStaffDocumentFile,
  type StaffDocument,
  type StaffDocumentCategory,
  type StaffDocumentMeta,
} from "@/lib/validation/staff-document";
import type { UserContext } from "@/types/auth";

const BUCKET = "staff-documents";

type Row = {
  id: string;
  user_id: string;
  category: StaffDocumentCategory;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
};

type Result<T> = { data: T; error: null } | { data: null; error: { code: string; message: string } };
const fail = (code: string, message: string) => ({ data: null, error: { code, message } });

const isSuperAdmin = (context: UserContext) => context.roles.includes("super_admin");
const canAccess = (row: { user_id: string }, context: UserContext) =>
  row.user_id === context.userId || isSuperAdmin(context);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-100) || "document";
}

/**
 * The signed-in user's documents. Super Admins can ask for everyone's (`scope: "all"`).
 * Read with the service role; access is decided here.
 */
export async function listStaffDocuments(
  context: UserContext,
  scope: "mine" | "all" = "mine",
): Promise<Result<StaffDocument[]>> {
  const admin = tenantClient(context);
  let query = admin
    .from("staff_documents")
    .select("id, user_id, category, title, file_name, storage_path, mime_type, file_size, expires_on, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (scope === "mine" || !isSuperAdmin(context)) query = query.eq("user_id", context.userId);
  const { data, error } = await query;
  if (error) return fail("db_error", error.message);

  const rows = (data ?? []) as Row[];
  const ownerIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = ownerIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", ownerIds)
    : { data: [] };
  const names = new Map(((profiles ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  // Whole days between today (UTC) and the expiry date.
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const daysUntil = (date: string) => Math.round((Date.parse(date) - today) / 86_400_000);

  return {
    data: rows.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      expiresOn: row.expires_on,
      notes: row.notes,
      createdAt: row.created_at,
      owner: { id: row.user_id, name: names.get(row.user_id) ?? "—" },
      canDelete: canAccess(row, context),
      daysLeft: row.expires_on ? daysUntil(row.expires_on) : null,
      expiry: !row.expires_on
        ? null
        : daysUntil(row.expires_on) < 0
          ? "expired"
          : daysUntil(row.expires_on) <= EXPIRY_WARNING_DAYS
            ? "soon"
            : null,
    })),
    error: null,
  };
}

/** Stores the file, then its details. Removes the file again if saving the details fails. */
export async function uploadStaffDocument(
  context: UserContext,
  file: File,
  meta: StaffDocumentMeta,
): Promise<Result<{ id: string }>> {
  const invalid = validateStaffDocumentFile(file);
  if (invalid) return fail("invalid_file", invalid);

  const overLimit = await checkPlanLimit("storage", file.size);
  if (overLimit) return fail(overLimit.code, overLimit.message);

  const admin = tenantClient(context);
  const path = `${context.userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upload.error) return fail("upload_failed", upload.error.message);

  const { data, error } = await admin
    .from("staff_documents")
    .insert({
      user_id: context.userId,
      category: meta.category,
      title: meta.title,
      file_name: file.name.slice(0, 255),
      storage_path: path,
      mime_type: file.type || null,
      file_size: file.size,
      expires_on: meta.expiresOn ?? null,
      notes: meta.notes || null,
      uploaded_by: context.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    await admin.storage.from(BUCKET).remove([path]);
    return fail("db_error", error?.message ?? "Could not save the document.");
  }
  return { data: { id: (data as { id: string }).id }, error: null };
}

async function findAccessible(id: string, context: UserContext) {
  const { data } = await tenantClient(context)
    .from("staff_documents")
    .select("id, user_id, storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  const row = data as Pick<Row, "id" | "user_id" | "storage_path" | "file_name"> | null;
  return row && canAccess(row, context) ? row : null;
}

/** A one-minute link to view (or, with `download`, save) the file. */
export async function staffDocumentUrl(
  id: string,
  context: UserContext,
  download: boolean,
): Promise<Result<string>> {
  const row = await findAccessible(id, context);
  if (!row) return fail("not_found", "Document not found.");
  const { data, error } = await tenantClient(context)
    .storage.from(BUCKET)
    .createSignedUrl(row.storage_path, 60, download ? { download: row.file_name } : undefined);
  if (error || !data?.signedUrl) return fail("sign_failed", error?.message ?? "Could not open the document.");
  return { data: data.signedUrl, error: null };
}

export async function deleteStaffDocument(id: string, context: UserContext): Promise<Result<true>> {
  const row = await findAccessible(id, context);
  if (!row) return fail("not_found", "Document not found.");
  const admin = tenantClient(context);
  const { error } = await admin.from("staff_documents").delete().eq("id", id);
  if (error) return fail("db_error", error.message);
  await admin.storage.from(BUCKET).remove([row.storage_path]);
  return { data: true, error: null };
}
