import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { updateCustomer } from "@/lib/customers/service";
import { firstFieldErrors } from "@/lib/validation";
import { editCustomerSchema } from "@/lib/validation/customer";

/** Edits a customer's contact details (Super Admins and the salesperson who added them). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("customer.view");
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const parsed = editCustomerSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Check the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await updateCustomer(id, parsed.data, auth.context);
  if (result.error) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "customer_exists"
            ? 409
            : 500;
    return jsonError(result.error.code, result.error.message, status, {
      fieldErrors: result.error.fieldErrors,
    });
  }
  return jsonOk({ ok: true });
}
