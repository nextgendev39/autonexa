-- Reverses 00074. Fails on the primary key if two dealerships saved the same setting: that is
-- intended, since going back would have to discard one dealership's data.
-- Removes every platform admin, because the table was empty before 00074.

delete from public.platform_admins;

drop policy role_permissions_manage on public.role_permissions;
drop policy roles_manage on public.roles;

create policy roles_manage on public.roles for all to authenticated
  using ((select public.has_permission('role.manage'::text)))
  with check ((select public.has_permission('role.manage'::text)) and is_system = false);

create policy role_permissions_manage on public.role_permissions for all to authenticated
  using ((select public.has_permission('role.manage'::text)) and (select public.is_super_admin()))
  with check ((select public.has_permission('role.manage'::text)) and (select public.is_super_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['vehicle_makes', 'vehicle_models', 'vehicle_model_years', 'vehicle_variants']
  loop
    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format('drop policy %I on public.%I', t || '_manage', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.is_active_staff()))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_permission(''settings.manage''::text)) or (select public.is_super_admin()))
         with check ((select public.has_permission(''settings.manage''::text)) or (select public.is_super_admin()))',
      t || '_manage', t
    );
  end loop;

  foreach t in array array[
    'acquisition_status_history', 'acquisitions', 'audit_logs', 'branch_locations', 'branches',
    'customers', 'documents', 'notifications', 'profiles', 'push_subscriptions', 'reservations',
    'sales', 'staff_documents', 'suppliers', 'system_settings', 'user_roles', 'vehicle_expenses',
    'vehicle_photos', 'vehicle_pricing', 'vehicle_pricing_history', 'vehicle_share_links',
    'vehicle_status_history', 'vehicles'
  ]
  loop
    execute format('drop policy tenant_isolation on public.%I', t);
  end loop;
end;
$$;

alter table public.system_settings drop constraint system_settings_pkey;
alter table public.system_settings add constraint system_settings_pkey primary key (key);
