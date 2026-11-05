import { firstFieldErrors } from "@/lib/validation";
import { updateAcquisitionSchema } from "@/lib/validation/acquisition";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { getAcquisition, updateAcquisition } from "@/lib/acquisitions/service";

function statusForCode(code: string) {
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (
    code === "duplicate_vin" ||
    code === "duplicate_chassis" ||
    code === "duplicate_acquisition" ||
    code === "invalid_transition" ||
    code === "conflict"
  ) {
    return 409;
  }
  return 400;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser("acquisition.view");
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const result = await getAcquisition(id, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser("acquisition.edit");
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = updateAcquisitionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const { id } = await context.params;
  const result = await updateAcquisition(id, parsed.data, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}
