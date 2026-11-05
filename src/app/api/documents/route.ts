import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { listStaffDocuments, uploadStaffDocument } from "@/lib/staff-documents/service";
import { firstFieldErrors } from "@/lib/validation";
import { staffDocumentMetaSchema } from "@/lib/validation/staff-document";

export async function GET(request: Request) {
  const auth = await requireApiUser("document.view");
  if ("response" in auth) return auth.response;
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "mine";
  const result = await listStaffDocuments(auth.context, scope);
  if (result.error) return jsonError(result.error.code, result.error.message, 500);
  return jsonOk(result.data);
}

/** multipart/form-data: file, category, title, expiresOn?, notes? */
export async function POST(request: Request) {
  const auth = await requireApiUser("document.view");
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return jsonError("validation", "Choose a file.", 400, { fieldErrors: { file: "documents.errors.fileRequired" } });
  }
  const parsed = staffDocumentMetaSchema.safeParse({
    category: form?.get("category"),
    title: form?.get("title"),
    expiresOn: form?.get("expiresOn") ?? undefined,
    notes: form?.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await uploadStaffDocument(auth.context, file, parsed.data);
  if (result.error) {
    if (result.error.code === "invalid_file") {
      return jsonError("validation", "This file can't be uploaded.", 400, { fieldErrors: { file: result.error.message } });
    }
    return jsonError(result.error.code, result.error.message, 500);
  }
  return jsonOk(result.data, { status: 201 });
}
