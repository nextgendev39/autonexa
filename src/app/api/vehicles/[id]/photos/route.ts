import { firstFieldErrors } from "@/lib/validation";
import { addVehiclePhotoSchema, addVehiclePhotosSchema } from "@/lib/validation/vehicle-photo";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { addVehiclePhoto, addVehiclePhotos, listVehiclePhotos } from "@/lib/vehicles/photos";

function statusForCode(code: string) {
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "conflict") return 409;
  return 400;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const result = await listVehiclePhotos(id, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const { id } = await context.params;

  // `{ photos: [...] }` saves a whole multi-file upload in one request.
  if ("photos" in body) {
    const parsedMany = addVehiclePhotosSchema.safeParse(body);
    if (!parsedMany.success) {
      return jsonError("validation", "Please correct the highlighted fields.", 400, {
        fieldErrors: firstFieldErrors(parsedMany.error),
      });
    }
    const result = await addVehiclePhotos(id, parsedMany.data.photos, auth.context);
    if (result.error) {
      return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
    }
    return jsonOk(result.data, { status: 201 });
  }

  const parsed = addVehiclePhotoSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await addVehiclePhoto(id, parsed.data, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data, { status: 201 });
}
