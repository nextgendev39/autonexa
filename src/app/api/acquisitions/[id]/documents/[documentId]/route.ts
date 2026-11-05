import { firstFieldErrors } from "@/lib/validation";
import {
  replaceAcquisitionDocumentSchema,
  updateAcquisitionDocumentMetaSchema,
} from "@/lib/validation/acquisition-document";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import {
  deleteAcquisitionDocument,
  replaceAcquisitionDocument,
  updateAcquisitionDocumentMeta,
} from "@/lib/acquisitions/documents";

function statusForCode(code: string) {
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "conflict") return 409;
  return 400;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = replaceAcquisitionDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const { id, documentId } = await context.params;
  const result = await replaceAcquisitionDocument(
    id,
    documentId,
    parsed.data,
    auth.context,
  );
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = updateAcquisitionDocumentMetaSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const { id, documentId } = await context.params;
  const result = await updateAcquisitionDocumentMeta(
    id,
    documentId,
    parsed.data,
    auth.context,
  );
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id, documentId } = await context.params;
  const result = await deleteAcquisitionDocument(id, documentId, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}
