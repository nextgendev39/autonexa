import { parseBody, respond } from "@/lib/platform/api";
import { removeStaff, updateStaffRole } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { updateStaffSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("admins.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, updateStaffSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await updateStaffRole(id, body.data.role);
  return respond(error);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("admins.manage");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const { error } = await removeStaff(id);
  return respond(error);
}
