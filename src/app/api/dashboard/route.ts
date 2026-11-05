import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard/service";

/**
 * Dashboard summary as application/json (not RSC / HTML).
 * Auth failures return JSON too — never redirects.
 */
export async function GET(request: Request) {
  const context = await getUserContext();

  if (!context || context.status === "SUSPENDED" || context.status === "DISABLED") {
    return NextResponse.json(
      { status: "error", error: "unauthorized", message: "Authentication required." },
      { status: 401 },
    );
  }

  if (context.status === "INVITED") {
    return NextResponse.json(
      { status: "error", error: "invitation_required", message: "Accept invitation first." },
      { status: 403 },
    );
  }

  const allowed =
    context.roles.includes("super_admin") || context.permissions.includes("dashboard.view");

  if (!allowed) {
    return NextResponse.json(
      { status: "error", error: "forbidden", message: "You do not have permission to view the dashboard." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    status: "success",
    data: await getDashboard(context, new URL(request.url).searchParams.get("month")),
  });
}
