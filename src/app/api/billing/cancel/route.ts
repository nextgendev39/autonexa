import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { cancelSchema } from "@/lib/validation/billing";

/** Stops at the end of the paid period, or changes that back. Access carries on until then. */
export async function POST(request: Request) {
  const auth = await requireApiUser("billing.manage");
  if ("response" in auth) return auth.response;
  const parsed = cancelSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);
  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_set_cancel_at_period_end" as never, { p_cancel: parsed.data.cancel } as never);
  if (error?.code === "P0002") return jsonError("nothing_to_cancel", "There's no running subscription with an end date.", 409);
  if (error) return jsonError("failed", error.message, error.code === "42501" ? 403 : 500);
  return jsonOk({ ok: true });
}
