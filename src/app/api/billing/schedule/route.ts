import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { scheduleSchema } from "@/lib/validation/billing";

/** A move to a smaller plan, from when the paid period ends. A null plan clears it. */
export async function POST(request: Request) {
  const auth = await requireApiUser("billing.manage");
  if ("response" in auth) return auth.response;
  const parsed = scheduleSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid request.", 400);
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "billing_schedule_change" as never,
    { p_plan_id: parsed.data.planId, p_cycle: parsed.data.cycle } as never,
  );
  if (error?.code === "P0002") return jsonError("nothing_to_change", "There's no running subscription to change.", 409);
  if (error) return jsonError("failed", error.message, error.code === "42501" ? 403 : 500);
  return jsonOk({ ok: true });
}
