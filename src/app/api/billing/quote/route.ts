import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";

/** What a change would cost this dealership. The database works it out, and the caller can't set it. */
export async function GET(request: Request) {
  const auth = await requireApiUser("billing.manage");
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") ?? "";
  const cycle = url.searchParams.get("cycle") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(plan)) return jsonError("validation", "Choose a plan.", 400);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_quote" as never, { p_plan_id: plan, p_cycle: cycle } as never);
  if (error) return jsonError("failed", error.message, error.code === "42501" ? 403 : 500);
  return jsonOk(data);
}
