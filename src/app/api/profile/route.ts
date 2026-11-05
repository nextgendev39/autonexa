import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { updateMyProfile } from "@/lib/profile/service";
import { firstFieldErrors } from "@/lib/validation";
import { updateProfileSchema } from "@/lib/validation/profile";

/** Updates the signed-in user's own name and phone. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const parsed = updateProfileSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Check the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await updateMyProfile(parsed.data, auth.context);
  if (result.error) return jsonError(result.error.code, result.error.message, 500);
  return jsonOk({ ok: true });
}
