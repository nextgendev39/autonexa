import { firstFieldErrors } from "@/lib/validation";
import { acquisitionExpenseSchema } from "@/lib/validation/acquisition";
import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { addAcquisitionExpense } from "@/lib/acquisitions/service";

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

  const parsed = acquisitionExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const { id } = await context.params;
  const result = await addAcquisitionExpense(id, parsed.data, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "conflict"
            ? 409
            : 400;
    return jsonError(result.error.code, result.error.message, status);
  }
  return jsonOk(result.data, { status: 201 });
}
