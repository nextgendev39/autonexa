import { parseBody, respond } from "@/lib/platform/api";
import { setStorefrontDisabled } from "@/lib/platform/service";
import { requirePlatformApi } from "@/lib/platform/session";
import { storefrontToggleSchema } from "@/lib/validation/storefront";

type RouteContext = { params: Promise<{ id: string }> };

/** Takes a dealership's website offline, or lifts that. Publishing stays the dealership's own. */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requirePlatformApi("storefronts.manage");
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, storefrontToggleSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  const { error } = await setStorefrontDisabled(id, body.data.disabled, body.data.reason);
  return respond(error);
}
