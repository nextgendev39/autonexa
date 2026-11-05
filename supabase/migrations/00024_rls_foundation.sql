-- Enable RLS on every public business table. No permissive public/anon policies.
-- Authenticated access is denied until Phase 4 adds permission-aware policies
-- (except the small bootstrap policies below).
-- The service role bypasses RLS and must never be used in the browser.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches',
    'profiles',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'vehicles',
    'vehicle_expenses',
    'vehicle_price_history',
    'vehicle_status_history',
    'vehicle_photos',
    'suppliers',
    'acquisitions',
    'inspection_templates',
    'inspection_template_items',
    'inspections',
    'inspection_items',
    'inspection_photos',
    'workshop_orders',
    'workshop_items',
    'customers',
    'lead_sources',
    'leads',
    'lead_activities',
    'reservations',
    'sales',
    'sale_price_history',
    'payments',
    'payment_allocations',
    'tax_rates',
    'invoices',
    'document_types',
    'documents',
    'notifications',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Temporary bootstrap: authenticated users can read/update their own profile only.
-- All other tables remain deny-by-default for authenticated/anon until Phase 4.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() and deleted_at is null);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

-- Notifications: users may read/update their own inbox rows.
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on policy "profiles_select_own" on public.profiles is
  'Phase 3 bootstrap. Broader RBAC policies arrive in Phase 4.';
