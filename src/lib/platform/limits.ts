import "server-only";

import { PLAN_LIMIT_MESSAGES, planLimitFromError, type PlanLimitReason } from "@/lib/platform/limit-errors";
import { createClient } from "@/lib/supabase/server";

export { planLimitFromError };

export type PlanLimit = "users" | "branches" | "vehicles" | "storage";

/**
 * Asks before starting work, so people get a clear answer rather than a failure halfway through.
 * Triggers enforce the same rule, so a failed or skipped check here cannot exceed a limit.
 */
export async function checkPlanLimit(key: PlanLimit, adding = 1) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "current_tenant_limit" as never,
    { p_key: key, p_adding: adding } as never,
  );
  if (error || !data) return null;
  const state = data as unknown as { allowed: boolean; reason: PlanLimitReason | null };
  if (state.allowed || !state.reason) return null;
  return { code: state.reason, message: PLAN_LIMIT_MESSAGES[state.reason] };
}
