-- Reverses 00078. Discards plans, subscriptions, invoices, payments, dealership settings and
-- domains: export anything worth keeping first. Dealership data is untouched.

drop function public.platform_usage();
drop function public.tenant_usage_counts(uuid);
drop function public.platform_record_payment(uuid, numeric, text, text, text, timestamptz);
drop function public.platform_cancel_subscription(uuid, text);
drop function public.platform_renew_subscription(uuid, timestamptz);
drop function public.platform_assign_plan(uuid, uuid, text, text, timestamptz);
drop function public.platform_set_tenant_status(uuid, text, text);
drop function public.notify_tenant_admins(uuid, text, text, text, jsonb);

drop table public.tenant_domains;
drop table public.tenant_settings;
drop table public.subscription_transactions;
drop table public.subscription_invoices;
drop function public.subscription_invoices_guard();
drop sequence public.subscription_invoice_number_seq;
drop table public.tenant_subscriptions;
drop table public.plan_features;
drop table public.platform_features;
drop table public.plans;
