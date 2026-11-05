import { jsonOk } from "@/lib/api/http";
import { deliverAfterResponse, inviteError, parseBody, respond } from "@/lib/platform/api";
import { createDealership, inviteOwner } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { createDealershipSchema } from "@/lib/validation/platform";

/** Creates a dealership, its subscription and the invitation for its first Super Admin. */
export async function POST(request: Request) {
  const auth = await requirePlatformApi("tenants.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, createDealershipSchema);
  if ("response" in body) return body.response;
  const values = body.data;

  const { id, error } = await createDealership(values);
  if (error || !id) return respond(error ?? { code: "db_error", message: "No dealership returned" });

  // The dealership stands either way. Its page offers the invitation again if this step fails.
  const invited = await inviteOwner(id, values);
  deliverAfterResponse();
  if (invited.error) return inviteError(invited.error);
  return jsonOk({ id });
}
