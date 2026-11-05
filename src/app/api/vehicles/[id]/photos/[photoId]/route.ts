import { firstFieldErrors } from "@/lib/validation";
import { updateVehiclePhotoSchema } from "@/lib/validation/vehicle-photo";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { deleteVehiclePhoto, updateVehiclePhoto } from "@/lib/vehicles/photos";

function statusForCode(code: string) {
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "conflict") return 409;
  return 400;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; photoId: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = updateVehiclePhotoSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const { id, photoId } = await context.params;
  const result = await updateVehiclePhoto(id, photoId, parsed.data, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; photoId: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id, photoId } = await context.params;
  const result = await deleteVehiclePhoto(id, photoId, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}
