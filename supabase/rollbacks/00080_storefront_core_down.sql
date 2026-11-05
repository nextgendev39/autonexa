-- Reverses 00080. Discards storefront designs and listing flags, never the vehicles themselves.
-- Fails if branding files remain in the bucket: remove them first. Fails if two dealerships hold
-- the same unverified domain, since the old rule allowed only one.

delete from storage.buckets where id = 'storefront-assets';

drop function public.storefront_resolve_host(text, text);
drop function public.storefront_set_vehicle_published(uuid, boolean);
drop trigger vehicles_guard_storefront_published on public.vehicles;
drop function public.vehicles_guard_storefront_published();
drop index public.vehicles_storefront_listed_idx;
alter table public.vehicles drop column storefront_published;

drop function public.platform_set_storefront_disabled(uuid, boolean, text);
drop function public.storefront_unpublish();
drop function public.storefront_publish();
drop table public.storefronts;

drop function public.storefront_record_domain_check(uuid, boolean, text, text);
drop policy tenant_domains_own_delete on public.tenant_domains;
drop policy tenant_domains_own_update on public.tenant_domains;
drop policy tenant_domains_own_insert on public.tenant_domains;
revoke update (is_primary) on public.tenant_domains from authenticated;
drop trigger a2_plan_limit on public.tenant_domains;
drop function public.guard_custom_domain_limit();
drop trigger a0_guard on public.tenant_domains;
drop function public.tenant_domains_guard();
drop index public.tenant_domains_verified_unique;
alter table public.tenant_domains
  drop constraint tenant_domains_tenant_domain_unique,
  drop constraint tenant_domains_ssl_status_valid,
  drop constraint tenant_domains_verification_status_valid,
  drop column last_error,
  drop column last_checked_at,
  drop column ssl_status,
  drop column verification_status,
  drop column verification_token,
  add constraint tenant_domains_domain_unique unique (domain);

alter table public.plans
  drop constraint plans_custom_domains_not_negative,
  drop column max_custom_domains;

delete from public.plan_features where feature_key like 'storefront%' and feature_key <> 'staff_documents';
delete from public.platform_features where key in ('storefront', 'storefront_custom_domain', 'storefront_booking', 'storefront_analytics');
delete from public.platform_role_permissions where permission in ('storefronts.view', 'storefronts.manage');
delete from public.role_permissions where permission_id in (select id from public.permissions where key = 'storefront.manage');
delete from public.permissions where key = 'storefront.manage';
