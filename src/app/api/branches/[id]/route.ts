import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { getUserContext } from "@/lib/auth/session";
import { currentTenantClient } from "@/lib/server/privileged";
import { firstFieldErrors } from "@/lib/validation";
import { updateBranchSchema } from "@/lib/validation/branch";
import { authErrorState, authFieldErrorState, authSuccessState } from "@/types/auth";

/** Edits a branch's details. Super Admins only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getUserContext();
  if (!context || !context.roles.includes("super_admin")) {
    return jsonAuthResponse(authErrorState("modules.branches.errors.editUnauthorized"), {
      status: 403,
    });
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const parsed = updateBranchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonAuthResponse(authFieldErrorState(firstFieldErrors(parsed.error)));
  }

  const { id } = await params;
  const v = parsed.data;
  const admin = (await currentTenantClient());
  const { data, error } = await admin
    .from("branches")
    .update({
      name: v.name,
      code: v.code,
      emirate: v.emirate,
      city: v.city,
      address_line_1: v.addressLine1,
      phone: v.phone,
      email: v.email,
      is_active: v.isActive,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return jsonAuthResponse(authFieldErrorState({ code: "modules.branches.errors.codeExists" }));
    }
    return jsonAuthResponse(
      authErrorState("modules.branches.errors.editFailed", {}, error.message),
    );
  }
  if (!data?.length) {
    return jsonAuthResponse(authErrorState("modules.branches.errors.notFound"), { status: 404 });
  }

  return jsonAuthResponse(authSuccessState());
}
