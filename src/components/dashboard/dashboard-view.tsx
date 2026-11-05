import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getDashboard } from "@/lib/dashboard/service";
import type { UserContext } from "@/types/auth";

/** Loads the dashboard figures (scoped to what the user may see) and renders them. */
export async function DashboardView({ context, month }: { context: UserContext; month?: string | null }) {
  const data = await getDashboard(context, month);
  return (
    <DashboardClient data={data} userName={context.displayName} />
  );
}
