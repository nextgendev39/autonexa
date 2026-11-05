-- Query performance only: no data, permission or visibility changes.
--
-- 1. Indexes for the columns booking lists, RLS and the deadline sweep filter or sort on.
-- 2. RLS: calls that don't depend on the row (auth.uid(), is_super_admin(),
--    can_view_all_bookings(), has_permission('<constant>'), …) are wrapped in
--    (select …) so Postgres evaluates them once per query instead of once per row
--    (Supabase "RLS performance" guidance). Each policy is otherwise recreated exactly
--    as its latest definition (source migration noted above it).

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- reservations_select / _update filter on branch and sales executive.
create index if not exists reservations_salesperson_id_idx on public.reservations (salesperson_id);
create index if not exists reservations_branch_id_idx on public.reservations (branch_id);
-- Booking lists sort by reserved_at; the deposit sweep scans active bookings by reserved_at.
create index if not exists reservations_reserved_at_idx on public.reservations (reserved_at desc);
create index if not exists reservations_status_reserved_at_idx
  on public.reservations (status, reserved_at);

-- Notification feed: a user's latest rows (the existing index covers unread rows only).
create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- audit_logs: from 00027_rls_policies.sql
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select"
  on public.audit_logs for select to authenticated
  using ((select public.has_permission('audit.view')));

-- branch_locations: from 00029_phase5_inventory.sql
drop policy if exists "branch_locations_manage" on public.branch_locations;
create policy branch_locations_manage on public.branch_locations
for all to authenticated
using (
  public.has_permission_for_branch('branch.manage', branch_id)
  or (select public.is_super_admin())
)
with check (
  public.has_permission_for_branch('branch.manage', branch_id)
  or (select public.is_super_admin())
);

-- branch_locations: from 00029_phase5_inventory.sql
drop policy if exists "branch_locations_select" on public.branch_locations;
create policy branch_locations_select on public.branch_locations
for select to authenticated
using (
  (select public.is_active_staff())
  and public.can_access_branch(branch_id)
);

-- branches: from 00027_rls_policies.sql
drop policy if exists "branches_manage" on public.branches;
create policy "branches_manage"
  on public.branches for all to authenticated
  using ((select public.has_permission('branch.manage')))
  with check ((select public.has_permission('branch.manage')));

-- branches: from 00027_rls_policies.sql
drop policy if exists "branches_select" on public.branches;
create policy "branches_select"
  on public.branches for select to authenticated
  using (
    (select public.has_permission('branch.view'))
    or public.can_access_branch(id)
  );

-- document_types: from 00027_rls_policies.sql
drop policy if exists "document_types_select" on public.document_types;
create policy "document_types_select"
  on public.document_types for select to authenticated
  using ((select public.has_permission('document.view')) or (select public.has_permission('document.create')));

-- notifications: from 00027_rls_policies.sql
drop policy if exists "notifications_insert_manage" on public.notifications;
create policy "notifications_insert_manage"
  on public.notifications for insert to authenticated
  with check ((select public.has_permission('user.manage')) or (select public.is_super_admin()));

-- notifications: from 00027_rls_policies.sql
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_permission('notification.view')));

-- notifications: from 00027_rls_policies.sql
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- permissions: from 00027_rls_policies.sql
drop policy if exists "permissions_select" on public.permissions;
create policy "permissions_select"
  on public.permissions for select to authenticated
  using ((select public.is_active_staff()));

-- profiles: from 00027_rls_policies.sql
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      id = (select auth.uid())
      or (select public.has_permission('user.manage'))
      or (select public.is_super_admin())
    )
  );

-- profiles: from 00027_rls_policies.sql
drop policy if exists "profiles_update_manage" on public.profiles;
create policy "profiles_update_manage"
  on public.profiles
  for update
  to authenticated
  using ((select public.has_permission('user.manage')) and deleted_at is null)
  with check ((select public.has_permission('user.manage')));

-- profiles: from 00027_rls_policies.sql
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) and deleted_at is null and (select public.is_active_staff()))
  with check (id = (select auth.uid()) and deleted_at is null);

-- reservations: from 00062_booking_owner_visibility.sql
drop policy if exists "reservations_select" on public.reservations;
create policy "reservations_select"
  on public.reservations for select to authenticated
  using (
    public.has_permission_for_branch('reservation.view', branch_id)
    and (
      (select public.can_view_all_bookings())
      or salesperson_id = (select auth.uid())
      or (salesperson_id is null and created_by = (select auth.uid()))
    )
  );

-- reservations: from 00062_booking_owner_visibility.sql
drop policy if exists "reservations_update" on public.reservations;
create policy "reservations_update"
  on public.reservations for update to authenticated
  using (
    (
      public.has_permission_for_branch('reservation.create', branch_id)
      or public.has_permission_for_branch('reservation.cancel', branch_id)
    )
    and (
      (select public.can_view_all_bookings())
      or salesperson_id = (select auth.uid())
      or (salesperson_id is null and created_by = (select auth.uid()))
    )
  )
  with check (
    public.has_permission_for_branch('reservation.create', branch_id)
    or public.has_permission_for_branch('reservation.cancel', branch_id)
  );

-- role_permissions: from 00027_rls_policies.sql
drop policy if exists "role_permissions_manage" on public.role_permissions;
create policy "role_permissions_manage"
  on public.role_permissions for all to authenticated
  using ((select public.has_permission('role.manage')) and (select public.is_super_admin()))
  with check ((select public.has_permission('role.manage')) and (select public.is_super_admin()));

-- role_permissions: from 00027_rls_policies.sql
drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select"
  on public.role_permissions for select to authenticated
  using ((select public.is_active_staff()));

-- roles: from 00027_rls_policies.sql
drop policy if exists "roles_manage" on public.roles;
create policy "roles_manage"
  on public.roles for all to authenticated
  using ((select public.has_permission('role.manage')))
  with check ((select public.has_permission('role.manage')) and is_system = false);

-- roles: from 00027_rls_policies.sql
drop policy if exists "roles_select" on public.roles;
create policy "roles_select"
  on public.roles for select to authenticated
  using ((select public.is_active_staff()));

-- sales: from 00027_rls_policies.sql
drop policy if exists "sales_select" on public.sales;
create policy "sales_select"
  on public.sales for select to authenticated
  using (
    public.has_permission_for_branch('sale.view', branch_id)
    or (salesperson_id = (select auth.uid()) and (select public.has_permission('sale.view')))
  );

-- staff_documents: from 00057_staff_documents.sql
drop policy if exists "staff_documents_select" on public.staff_documents;
create policy "staff_documents_select"
  on public.staff_documents for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_super_admin()));

-- suppliers: from 00027_rls_policies.sql
drop policy if exists "suppliers_mutate" on public.suppliers;
create policy "suppliers_mutate"
  on public.suppliers for all to authenticated
  using ((select public.has_permission('acquisition.edit')) or (select public.has_permission('acquisition.create')))
  with check ((select public.has_permission('acquisition.edit')) or (select public.has_permission('acquisition.create')));

-- suppliers: from 00027_rls_policies.sql
drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select"
  on public.suppliers for select to authenticated
  using ((select public.has_permission('acquisition.view')) or (select public.has_permission('vehicle.view')));

-- system_settings: from 00033_vehicle_ready_for_sale.sql
drop policy if exists "system_settings_manage" on public.system_settings;
create policy "system_settings_manage"
  on public.system_settings for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

-- user_roles: from 00027_rls_policies.sql
drop policy if exists "user_roles_manage_super" on public.user_roles;
create policy "user_roles_manage_super"
  on public.user_roles for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- user_roles: from 00027_rls_policies.sql
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select"
  on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.has_permission('user.manage'))
    or (select public.has_permission('role.manage'))
  );

-- vehicle_makes: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_makes_manage" on public.vehicle_makes;
create policy vehicle_makes_manage on public.vehicle_makes
for all to authenticated
using ((select public.has_permission('settings.manage')) or (select public.is_super_admin()))
with check ((select public.has_permission('settings.manage')) or (select public.is_super_admin()));

-- vehicle_makes: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_makes_select" on public.vehicle_makes;
create policy vehicle_makes_select on public.vehicle_makes
for select to authenticated
using ((select public.is_active_staff()));

-- vehicle_model_years: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_model_years_manage" on public.vehicle_model_years;
create policy vehicle_model_years_manage on public.vehicle_model_years
for all to authenticated
using ((select public.has_permission('settings.manage')) or (select public.is_super_admin()))
with check ((select public.has_permission('settings.manage')) or (select public.is_super_admin()));

-- vehicle_model_years: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_model_years_select" on public.vehicle_model_years;
create policy vehicle_model_years_select on public.vehicle_model_years
for select to authenticated
using ((select public.is_active_staff()));

-- vehicle_models: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_models_manage" on public.vehicle_models;
create policy vehicle_models_manage on public.vehicle_models
for all to authenticated
using ((select public.has_permission('settings.manage')) or (select public.is_super_admin()))
with check ((select public.has_permission('settings.manage')) or (select public.is_super_admin()));

-- vehicle_models: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_models_select" on public.vehicle_models;
create policy vehicle_models_select on public.vehicle_models
for select to authenticated
using ((select public.is_active_staff()));

-- vehicle_variants: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_variants_manage" on public.vehicle_variants;
create policy vehicle_variants_manage on public.vehicle_variants
for all to authenticated
using ((select public.has_permission('settings.manage')) or (select public.is_super_admin()))
with check ((select public.has_permission('settings.manage')) or (select public.is_super_admin()));

-- vehicle_variants: from 00044_vehicle_master_catalog.sql
drop policy if exists "vehicle_variants_select" on public.vehicle_variants;
create policy vehicle_variants_select on public.vehicle_variants
for select to authenticated
using ((select public.is_active_staff()));
