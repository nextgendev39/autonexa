export type PlanLimitReason = "plan_limit_exceeded" | "subscription_inactive";

export const PLAN_LIMIT_MESSAGES: Record<PlanLimitReason, string> = {
  plan_limit_exceeded: "Your plan's limit has been reached. Contact AutoNexa to upgrade.",
  subscription_inactive: "Your subscription has ended. Renew it to add new records.",
};

/** The database's refusal, in a form routes can answer with. Null for any other error. */
export function planLimitFromError(error: { message?: string } | null | undefined) {
  const match = error?.message?.match(/^(plan_limit_exceeded|subscription_inactive):/);
  if (!match) return null;
  const reason = match[1] as PlanLimitReason;
  return { code: reason, message: PLAN_LIMIT_MESSAGES[reason] };
}
