import { parseBody, respond } from "@/lib/platform/api";
import { updateDemoRequest } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { demoRequestUpdateSchema } from "@/lib/validation/platform";

type RouteContext = { params: Promise<{ id: string }> };

/** Follows up a landing-page demo request: its status, the team's notes, and the dealership it became. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("demo_requests.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, demoRequestUpdateSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await updateDemoRequest(id, body.data);
  return respond(error);
}
