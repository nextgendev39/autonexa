import { jsonOk } from "@/lib/api/http";
import { inviteError, parseBody, respond } from "@/lib/platform/api";
import { getDealership, inviteOwner } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { inviteOwnerSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

/** Invites a Super Admin into a dealership that doesn't have one, such as after a failed email. */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("tenants.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, inviteOwnerSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  // The next step runs with the service role and trusts this ID, so RLS must show it exists first.
  if (!(await getDealership(id))) return respond({ code: "P0002" });
  const invited = await inviteOwner(id, body.data);
  if (invited.error) return inviteError(invited.error);
  return jsonOk({ ok: true });
}
