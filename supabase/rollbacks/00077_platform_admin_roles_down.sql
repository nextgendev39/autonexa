-- Reverses 00077. Discards the platform audit log and any console-only platform staff; catalog rows
-- from 00074 stay.

drop policy tenants_platform_update on public.tenants;
drop policy tenants_platform_insert on public.tenants;
drop policy tenants_platform_select on public.tenants;
revoke insert, update on public.tenants from authenticated;

drop trigger platform_audit_row on public.tenants;
drop trigger platform_audit_row on public.platform_admins;
drop function public.platform_audit_row();
drop function public.platform_record_event(text, text, uuid, uuid, jsonb);
drop function public.platform_log(text, text, uuid, uuid, jsonb, jsonb, jsonb);
drop table public.platform_audit_logs;
drop function public.platform_audit_logs_append_only();

drop policy role_permissions_manage on public.role_permissions;
drop policy roles_manage on public.roles;

create policy roles_manage on public.roles for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()) and is_system = false);

create policy role_permissions_manage on public.role_permissions for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['vehicle_makes', 'vehicle_models', 'vehicle_model_years', 'vehicle_variants']
  loop
    execute format('drop policy %I on public.%I', t || '_manage', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.is_platform_admin()))
         with check ((select public.is_platform_admin()))',
      t || '_manage', t
    );
  end loop;
end;
$$;

drop function public.platform_admin_list();
drop policy platform_admins_delete on public.platform_admins;
drop policy platform_admins_update on public.platform_admins;
drop policy platform_admins_insert on public.platform_admins;
drop policy platform_admins_select on public.platform_admins;
revoke select, insert, update, delete on public.platform_admins from authenticated;

drop trigger a0_guard_platform_staff on public.tenant_members;
drop function public.tenant_members_guard_platform_staff();
drop trigger platform_admins_guard on public.platform_admins;
drop function public.platform_admins_guard();

drop function public.current_platform_access();
drop table public.platform_role_permissions;
drop function public.has_platform_permission(text);

delete from public.platform_admins where role <> 'catalog';
alter table public.platform_admins
  drop constraint platform_admins_role_valid,
  drop column created_by,
  drop column role;
