import { firstFieldErrors } from "@/lib/validation";
import { receiveAcquisitionSchema } from "@/lib/validation/acquisition";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { receiveAcquisition } from "@/lib/acquisitions/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  const parsed = receiveAcquisitionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const { id } = await context.params;
  const result = await receiveAcquisition(id, parsed.data, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "invalid_transition" || result.error.code === "conflict"
            ? 409
            : 400;
    return jsonError(result.error.code, result.error.message, status);
  }
  return jsonOk(result.data);
}
