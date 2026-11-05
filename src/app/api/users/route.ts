import { NextResponse } from "next/server";
import { getActiveSuperAdmin } from "@/lib/users/guard";
import { listUsers } from "@/lib/users/service";
import { authErrorState } from "@/types/auth";
import { jsonAuthResponse } from "@/lib/auth/http";

export async function GET() {
  if (!(await getActiveSuperAdmin())) {
    return jsonAuthResponse(authErrorState("modules.users.errors.unauthorized"), { status: 403 });
  }

  const users = await listUsers();
  return NextResponse.json(users);
}
