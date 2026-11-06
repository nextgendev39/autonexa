import { ZOHAAN_TENANT_ID, id } from "./seed";

const PLAN = "11111111-1111-4111-8111-111111111111";

/**
 * Every function platform staff call that takes an ID, as dealership staff would call it. The
 * isolation guard fails if a new one is missing, and platform.test.ts runs each as an attack.
 */
export const PLATFORM_CALLS: Record<string, string> = {
  platform_set_tenant_status: `select public.platform_set_tenant_status('${ZOHAAN_TENANT_ID}', 'suspended', 'x')`,
  platform_assign_plan: `select public.platform_assign_plan('${ZOHAAN_TENANT_ID}', '${PLAN}')`,
  platform_renew_subscription: `select public.platform_renew_subscription('${PLAN}', now() + interval '1 year')`,
  platform_cancel_subscription: `select public.platform_cancel_subscription('${PLAN}', 'x')`,
  platform_record_payment: `select public.platform_record_payment('${PLAN}', 1)`,
  platform_record_event: `select public.platform_record_event('forged', 'tenants', '${id("a", "branch")}')`,
  platform_set_storefront_disabled: `select public.platform_set_storefront_disabled('${ZOHAAN_TENANT_ID}', true, 'x')`,
  platform_prepare_refund: `select public.platform_prepare_refund('${PLAN}', 1)`,
  platform_update_demo_request: `select public.platform_update_demo_request('${PLAN}', 'converted', 'x', '${ZOHAAN_TENANT_ID}')`,
  storefront_set_vehicle_published: `select public.storefront_set_vehicle_published('${id("a", "vehicle")}', true)`,
  storefront_set_vehicle_details: `select public.storefront_set_vehicle_details('${id("a", "vehicle")}', 'x', array['y'])`,
};

export const PLATFORM_FUNCTIONS = Object.keys(PLATFORM_CALLS);

/** Dealerships may call these, about themselves only. billing.test.ts tests that. */
export const SELF_SCOPED_FUNCTIONS = ["billing_quote", "billing_schedule_change"];
