import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { firstFieldErrors } from "@/lib/validation";
import { saveProfileFor } from "@/lib/billing/profile";
import { billingProfileSchema } from "@/lib/validation/billing";

export async function PUT(request: Request) {
  const auth = await requireApiUser("billing.manage");
  if ("response" in auth) return auth.response;
  const parsed = billingProfileSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }
  const error = await saveProfileFor(auth.context, parsed.data);
  if (error) return jsonError("failed", error.message ?? "Could not save.", error.code === "42501" ? 403 : 500);
  return jsonOk({ ok: true });
}
