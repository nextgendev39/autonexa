import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { setPublished } from "@/lib/storefront/manage";
import { publishSchema } from "@/lib/validation/storefront";

export async function POST(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const parsed = publishSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);
  const { error } = await setPublished(parsed.data.action);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
