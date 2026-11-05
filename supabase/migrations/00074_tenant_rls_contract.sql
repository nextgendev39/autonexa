-- SaaS Phase 2: the contract stage Phase 1 prepared for. Until now tenant isolation rested on
-- each permissive policy happening to check a tenant-bound branch. Several do not (customers
-- with no branch, suppliers, settings, profiles, roles, audit logs).
-- A restrictive policy is ANDed with every permissive one, so none can widen past the tenant.
-- Changes no row except the platform_admins grant below.
-- Rollback: supabase/rollbacks/00074_tenant_rls_contract_down.sql

-- ---------------------------------------------------------------------------
-- Settings: one row per dealership
-- ---------------------------------------------------------------------------

alter table public.system_settings drop constraint system_settings_pkey;
alter table public.system_settings add constraint system_settings_pkey primary key (tenant_id, key);

-- ---------------------------------------------------------------------------
-- Tenant rows
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'acquisition_status_history', 'acquisitions', 'audit_logs', 'branch_locations', 'branches',
    'customers', 'documents', 'notifications', 'push_subscriptions', 'reservations', 'sales',
    'staff_documents', 'suppliers', 'system_settings', 'user_roles', 'vehicle_expenses',
    'vehicle_photos', 'vehicle_pricing', 'vehicle_pricing_history', 'vehicle_share_links',
    'vehicle_status_history', 'vehicles'
  ]
  loop
    execute format(
      'create policy tenant_isolation on public.%I as restrictive for all to authenticated
         using (tenant_id = (select public.current_tenant_id()))
         with check (tenant_id = (select public.current_tenant_id()))',
      t
    );
  end loop;
end;
$$;

-- People must always be able to read their own profile: sign-in uses it to tell a removed member
-- or suspended dealership apart from a missing account. Writes stay inside the tenant, which is
-- also what stops an admin moving themselves into another dealership.
create policy tenant_isolation on public.profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- ---------------------------------------------------------------------------
-- Shared data: changing it affects every dealership, so only platform staff may
-- ---------------------------------------------------------------------------

drop policy vehicle_makes_manage on public.vehicle_makes;
drop policy vehicle_models_manage on public.vehicle_models;
drop policy vehicle_model_years_manage on public.vehicle_model_years;
drop policy vehicle_variants_manage on public.vehicle_variants;
drop policy vehicle_makes_select on public.vehicle_makes;
drop policy vehicle_models_select on public.vehicle_models;
drop policy vehicle_model_years_select on public.vehicle_model_years;
drop policy vehicle_variants_select on public.vehicle_variants;
drop policy roles_manage on public.roles;
drop policy role_permissions_manage on public.role_permissions;

do $$
declare
  t text;
begin
  foreach t in array array['vehicle_makes', 'vehicle_models', 'vehicle_model_years', 'vehicle_variants']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.is_active_staff()) or (select public.is_platform_admin()))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.is_platform_admin()))
         with check ((select public.is_platform_admin()))',
      t || '_manage', t
    );
  end loop;
end;
$$;

create policy roles_manage on public.roles for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()) and is_system = false);

create policy role_permissions_manage on public.role_permissions for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- Zohaan's Super Admins manage the catalog today. Keeping that workflow means making them platform
-- admins; dealerships added later do not get this. Review this list after deploying.
insert into public.platform_admins (user_id)
select distinct ur.user_id
from public.user_roles ur
join public.roles r on r.id = ur.role_id
join public.profiles p on p.id = ur.user_id
where r.key = 'super_admin'
  and ur.tenant_id = '00000000-0000-4000-8000-000000000001'
  and p.status = 'active'
  and p.deleted_at is null
on conflict do nothing;
