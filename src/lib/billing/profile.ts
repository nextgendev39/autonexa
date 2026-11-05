import "server-only";

import { saveBillingProfile } from "@/lib/billing/data";
import type { UserContext } from "@/types/auth";

/** The dealership comes from the session, never the request. */
export const saveProfileFor = (context: UserContext, values: Parameters<typeof saveBillingProfile>[2]) =>
  saveBillingProfile(context.tenantId as string, context.userId, values);
