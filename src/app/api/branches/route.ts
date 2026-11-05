import { NextResponse } from "next/server";

import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { getUserContext } from "@/lib/auth/session";
import { listBranchesForUser } from "@/lib/branches/service";
import { checkPlanLimit } from "@/lib/platform/limits";
import { currentTenantClient } from "@/lib/server/privileged";
import { firstFieldErrors } from "@/lib/validation";
import { createBranchSchema } from "@/lib/validation/branch";
import { authErrorState, authFieldErrorState, authSuccessState } from "@/types/auth";

export async function GET() {
  const context = await getUserContext();
  if (!context || context.status !== "ACTIVE") {
    return jsonAuthResponse(authErrorState("auth.errors.unauthorized"), { status: 401 });
  }
  return NextResponse.json(await listBranchesForUser());
}

export async function POST(request: Request) {
  const context = await getUserContext();
  if (!context || !context.roles.includes("super_admin")) {
    return jsonAuthResponse(authErrorState("modules.branches.errors.unauthorized"), { status: 403 });
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonAuthResponse(authFieldErrorState(firstFieldErrors(parsed.error)));
  }

  const overLimit = await checkPlanLimit("branches");
  if (overLimit) {
    return jsonAuthResponse(authErrorState(`modules.branches.errors.${overLimit.code}`), { status: 403 });
  }

  const v = parsed.data;
  const admin = (await currentTenantClient());
  const { error } = await admin.from("branches").insert({
    name: v.name,
    code: v.code,
    emirate: v.emirate,
    city: v.city,
    address_line_1: v.addressLine1,
    phone: v.phone,
    email: v.email,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return jsonAuthResponse(authFieldErrorState({ code: "modules.branches.errors.codeExists" }));
    }
    return jsonAuthResponse(
      authErrorState("modules.branches.errors.createFailed", {}, error.message),
    );
  }

  return jsonAuthResponse(authSuccessState());
}
