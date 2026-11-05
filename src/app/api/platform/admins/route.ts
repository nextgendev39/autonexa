import { jsonOk } from "@/lib/api/http";
import { inviteError, parseBody } from "@/lib/platform/api";
import { inviteStaff } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { inviteStaffSchema } from "@/lib/validation/platform";

export async function POST(request: Request) {
  const auth = await requirePlatformApi("admins.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, inviteStaffSchema);
  if ("response" in body) return body.response;
  const invited = await inviteStaff(body.data);
  if (invited.error) return inviteError(invited.error);
  return jsonOk({ ok: true });
}
