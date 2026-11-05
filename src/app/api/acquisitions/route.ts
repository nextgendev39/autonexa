import { firstFieldErrors } from "@/lib/validation";
import {
  acquisitionListQuerySchema,
  createAcquisitionSchema,
} from "@/lib/validation/acquisition";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { createAcquisition, listAcquisitions } from "@/lib/acquisitions/service";

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

export async function GET(request: Request) {
  const auth = await requireApiUser("acquisition.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = acquisitionListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", "Invalid query parameters.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await listAcquisitions(parsed.data, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code));
  }
  return jsonOk(result.data);
}

export async function POST(request: Request) {
  const auth = await requireApiUser("acquisition.create");
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = createAcquisitionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await createAcquisition(parsed.data, auth.context);
  if (result.error) {
    return jsonError(result.error.code, result.error.message, statusForCode(result.error.code), {
      details: {
        ...(result.error.existingVehicleId
          ? { existingVehicleId: result.error.existingVehicleId }
          : {}),
        ...(result.error.existingAcquisitionId
          ? { existingAcquisitionId: result.error.existingAcquisitionId }
          : {}),
      },
    });
  }

  return jsonOk(result.data, { status: 201 });
}
