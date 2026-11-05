import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { uploadAsset } from "@/lib/storefront/manage";

export async function POST(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File) || (kind !== "logo" && kind !== "banner")) {
    return jsonError("validation", "Choose an image.", 400);
  }
  const { path, error } = await uploadAsset(auth.context, file, kind);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ path });
}
