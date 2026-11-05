-- Phase 4 security / RLS smoke tests.
-- Intended to run inside a transaction that rolls back.
-- Usage: psql "$DATABASE_URL" -f supabase/tests/rls_security_checks.sql
-- Or: npm run db:test:security (when local Supabase is running)

begin;

-- Helper assertions
create temporary table _security_assert (
  name text primary key,
  ok boolean not null
);

create or replace function pg_temp.assert(name text, condition boolean)
returns void
language plpgsql
as $$
begin
  insert into _security_assert(name, ok) values (name, condition)
  on conflict (name) do update set ok = excluded.ok;
  if not condition then
    raise exception 'ASSERT FAILED: %', name;
  end if;
end;
$$;

-- Functions exist
select pg_temp.assert(
  'has_permission_fn',
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_permission'
  )
);

select pg_temp.assert(
  'is_active_staff_fn',
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_active_staff'
  )
);

select pg_temp.assert(
  'assign_user_role_fn',
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'assign_user_role'
  )
);

-- RLS enabled on critical tables
select pg_temp.assert(
  'rls_vehicles',
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'vehicles')
);

select pg_temp.assert(
  'rls_audit_logs',
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'audit_logs')
);

select pg_temp.assert(
  'rls_user_roles',
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'user_roles')
);

-- Policies present (not deny-only)
select pg_temp.assert(
  'policy_vehicles_select',
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vehicles' and policyname = 'vehicles_select'
  )
);

select pg_temp.assert(
  'policy_audit_select',
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_select'
  )
);

-- No UPDATE/DELETE policies on audit_logs
select pg_temp.assert(
  'audit_immutable',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd in ('UPDATE', 'DELETE', 'ALL')
  )
);

-- Role mappings seeded for operational roles
select pg_temp.assert(
  'sales_executive_mapped',
  exists (
    select 1
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.key = 'sales_executive'
  )
);

select pg_temp.assert(
  'inventory_manager_mapped',
  exists (
    select 1
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.key = 'inventory_manager'
  )
);

select pg_temp.assert(
  'accountant_mapped',
  exists (
    select 1
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    where r.key = 'accountant'
  )
);

-- New sensitive permissions exist
select pg_temp.assert(
  'profit_permission',
  exists (select 1 from public.permissions where key = 'vehicle.profit.view')
);

select pg_temp.assert(
  'financial_report_permission',
  exists (select 1 from public.permissions where key = 'report.financial.view')
);

-- Sales executive must NOT have payment.view or vehicle.cost.view
select pg_temp.assert(
  'sales_exec_no_payment_view',
  not exists (
    select 1
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where r.key = 'sales_executive' and p.key = 'payment.view'
  )
);

select pg_temp.assert(
  'sales_exec_no_cost_view',
  not exists (
    select 1
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where r.key = 'sales_executive' and p.key = 'vehicle.cost.view'
  )
);

-- Viewer cannot create vehicles
select pg_temp.assert(
  'viewer_no_vehicle_create',
  not exists (
    select 1
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where r.key = 'viewer' and p.key = 'vehicle.create'
  )
);

-- Storage helper functions exist
select pg_temp.assert(
  'storage_vehicle_helper',
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_access_vehicle_storage'
  )
);

select 'Phase 4 security checks passed' as result;
select * from _security_assert order by name;

rollback;
