import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { firstFieldErrors } from "@/lib/validation";
import { enquirySchema } from "@/lib/validation/storefront";

/**
 * The enquiry form in the admin's preview: checked exactly as on the live site, then not sent, so
 * trying the form never puts a made-up customer in the CRM or alerts the team.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser("storefront.manage");
  if ("response" in auth) return auth.response;
  const parsed = enquirySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }
  return jsonOk({ ok: true, preview: true });
}
