-- Rollback of 00071. Run manually, only with approval, after 00072's rollback.
-- It drops the tenant_id columns, which is safe only while Zohaan Motors is the sole tenant,
-- so it refuses to run once a second dealership exists. No other column is touched.
do $$
begin
  if exists (select 1 from public.tenants where id <> '00000000-0000-4000-8000-000000000001') then
    raise exception 'Refusing to roll back: a second dealership exists.';
  end if;
end;
$$;

drop trigger profiles_sync_membership on public.profiles;
drop function public.sync_profile_membership();
drop trigger a0_tenant_from_parent on public.acquisition_status_history;
drop trigger a0_tenant_from_parent on public.acquisitions;
drop trigger a0_tenant_from_parent on public.branch_locations;
drop trigger a0_tenant_from_parent on public.documents;
drop trigger a0_tenant_from_parent on public.notifications;
drop trigger a0_tenant_from_parent on public.push_subscriptions;
drop trigger a0_tenant_from_parent on public.reservations;
drop trigger a0_tenant_from_parent on public.sales;
drop trigger a0_tenant_from_parent on public.staff_documents;
drop trigger a0_tenant_from_parent on public.user_roles;
drop trigger a0_tenant_from_parent on public.vehicle_expenses;
drop trigger a0_tenant_from_parent on public.vehicle_photos;
drop trigger a0_tenant_from_parent on public.vehicle_pricing;
drop trigger a0_tenant_from_parent on public.vehicle_pricing_history;
drop trigger a0_tenant_from_parent on public.vehicle_share_links;
drop trigger a0_tenant_from_parent on public.vehicle_status_history;
drop trigger a0_tenant_from_parent on public.vehicles;
drop function public.tenant_from_parent();

alter table public.branches drop column tenant_id;
alter table public.branch_locations drop column tenant_id;
alter table public.profiles drop column tenant_id;
alter table public.user_roles drop column tenant_id;
alter table public.customers drop column tenant_id;
alter table public.suppliers drop column tenant_id;
alter table public.vehicles drop column tenant_id;
alter table public.vehicle_photos drop column tenant_id;
alter table public.vehicle_expenses drop column tenant_id;
alter table public.vehicle_pricing drop column tenant_id;
alter table public.vehicle_pricing_history drop column tenant_id;
alter table public.vehicle_status_history drop column tenant_id;
alter table public.vehicle_share_links drop column tenant_id;
alter table public.acquisitions drop column tenant_id;
alter table public.acquisition_status_history drop column tenant_id;
alter table public.reservations drop column tenant_id;
alter table public.sales drop column tenant_id;
alter table public.documents drop column tenant_id;
alter table public.staff_documents drop column tenant_id;
alter table public.notifications drop column tenant_id;
alter table public.push_subscriptions drop column tenant_id;
alter table public.audit_logs drop column tenant_id;
alter table public.system_settings drop column tenant_id;
