import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { invalidateBookingDeadlines } from "@/lib/notifications/service";
import { getPaymentTerms, updatePaymentTerms } from "@/lib/settings/payment-terms";
import { firstFieldErrors } from "@/lib/validation";
import { paymentTermsSchema } from "@/lib/validation/payment-terms";

export async function GET() {
  const auth = await requireApiUser("settings.view");
  if ("response" in auth) return auth.response;
  return jsonOk(await getPaymentTerms());
}

export async function PUT(request: Request) {
  const auth = await requireApiUser("settings.manage");
  if ("response" in auth) return auth.response;

  const parsed = paymentTermsSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Invalid payment terms.", 400, { fieldErrors: firstFieldErrors(parsed.error) });
  }
  const error = await updatePaymentTerms(parsed.data, auth.context.userId);
  if (error) return jsonError("db_error", error, 500);
  invalidateBookingDeadlines();
  return jsonOk(parsed.data);
}
