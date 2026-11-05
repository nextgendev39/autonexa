import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { changeMyPassword } from "@/lib/profile/service";
import { firstFieldErrors } from "@/lib/validation";
import { changePasswordSchema } from "@/lib/validation/profile";

/** Changes the signed-in user's password after checking the current one. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const parsed = changePasswordSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Check the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }

  const result = await changeMyPassword(parsed.data, auth.context);
  if (result.error) {
    const status = result.error.fieldErrors ? 400 : 500;
    return jsonError(result.error.code, result.error.message, status, {
      fieldErrors: result.error.fieldErrors,
    });
  }
  return jsonOk({ ok: true });
}
