-- SaaS Phase 3: platform staff get real roles, kept apart from dealership staff.
-- Until now platform_admins was one flag, which was enough for editing the shared catalog. Rows
-- that already exist (Zohaan's Super Admins, from 00074) become the `catalog` role: they keep that
-- workflow and gain no access to the console or to other dealerships.
-- Rollback: supabase/rollbacks/00077_platform_admin_roles_down.sql

alter table public.platform_admins
  add column role text not null default 'catalog',
  add column created_by uuid,
  add constraint platform_admins_role_valid
    check (role in ('owner', 'admin', 'billing', 'support', 'catalog'));

create table public.platform_role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission),
  constraint platform_role_permissions_role_valid
    check (role in ('owner', 'admin', 'billing', 'support', 'catalog'))
);

comment on table public.platform_role_permissions is
  'What each platform role may do. Separate from public.permissions, which is dealership staff only.';

insert into public.platform_role_permissions (role, permission)
select 'owner', p from unnest(array[
  'console.access', 'tenants.view', 'tenants.manage', 'subscriptions.view', 'subscriptions.manage',
  'plans.view', 'plans.manage', 'billing.view', 'billing.manage', 'usage.view', 'audit.view',
  'admins.manage', 'catalog.manage', 'roles.manage'
]) p
union all
select 'admin', p from unnest(array[
  'console.access', 'tenants.view', 'tenants.manage', 'subscriptions.view', 'subscriptions.manage',
  'plans.view', 'plans.manage', 'billing.view', 'usage.view', 'audit.view', 'catalog.manage'
]) p
union all
select 'billing', p from unnest(array[
  'console.access', 'tenants.view', 'subscriptions.view', 'subscriptions.manage', 'plans.view',
  'billing.view', 'billing.manage', 'usage.view'
]) p
union all
select 'support', p from unnest(array[
  'console.access', 'tenants.view', 'subscriptions.view', 'plans.view', 'usage.view', 'audit.view'
]) p
union all
select 'catalog', 'catalog.manage';

-- A disabled or deleted login loses platform access at once, whatever its row says.
create function public.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join public.platform_role_permissions rp on rp.role = pa.role
    join public.profiles pr on pr.id = pa.user_id
    where pa.user_id = auth.uid()
      and rp.permission = p_permission
      and pr.status = 'active'
      and pr.deleted_at is null
  );
$$;

-- What the server asks at the start of each request. Takes nothing from the client.
create function public.current_platform_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', pa.role,
    'permissions', coalesce(
      (select jsonb_agg(rp.permission order by rp.permission)
       from public.platform_role_permissions rp where rp.role = pa.role),
      '[]'::jsonb
    )
  )
  from public.platform_admins pa
  join public.profiles pr on pr.id = pa.user_id
  where pa.user_id = auth.uid()
    and pr.status = 'active'
    and pr.deleted_at is null;
$$;

revoke all on function public.has_platform_permission(text) from public, anon;
revoke all on function public.current_platform_access() from public, anon;
grant execute on function public.has_platform_permission(text) to authenticated, service_role;
grant execute on function public.current_platform_access() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One login is either platform staff or dealership staff. `catalog` is the one exception, since it
-- reaches no dealership data, and is what keeps Zohaan's catalog workflow.
-- ---------------------------------------------------------------------------

create function public.platform_admins_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(new.user_id, old.user_id);
begin
  if tg_op <> 'DELETE' and new.role <> 'catalog' and exists (
    select 1 from public.tenant_members m where m.user_id = new.user_id
  ) then
    raise exception 'a dealership login cannot be platform staff: use a separate login'
      using errcode = '23514';
  end if;

  -- Privileged server code and database maintenance have no session and are not limited here.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if v_target = auth.uid() then
    raise exception 'platform admins cannot change their own access' using errcode = '42501';
  end if;

  if tg_op <> 'INSERT' and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.platform_admins pa
       where pa.role = 'owner' and pa.user_id <> old.user_id
     ) then
    raise exception 'the last platform owner cannot be removed' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.platform_admins_guard() from public, anon, authenticated;

create trigger platform_admins_guard
before insert or update or delete on public.platform_admins
for each row execute function public.platform_admins_guard();

create function public.tenant_members_guard_platform_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.platform_admins pa
    where pa.user_id = new.user_id and pa.role <> 'catalog'
  ) then
    raise exception 'platform staff cannot join a dealership: use a separate login'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_members_guard_platform_staff() from public, anon, authenticated;

create trigger a0_guard_platform_staff
before insert on public.tenant_members
for each row execute function public.tenant_members_guard_platform_staff();

-- ---------------------------------------------------------------------------
-- Who can see and change platform staff. Row-level access only: listing emails goes through
-- platform_admin_list() so no client reads auth.users.
-- ---------------------------------------------------------------------------

alter table public.platform_role_permissions enable row level security;
revoke all on public.platform_role_permissions from anon, authenticated;
grant select on public.platform_role_permissions to authenticated;
grant all on public.platform_role_permissions to service_role;

create policy platform_role_permissions_select on public.platform_role_permissions
  for select to authenticated
  using ((select public.has_platform_permission('console.access')));

grant select, insert, update, delete on public.platform_admins to authenticated;

create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.has_platform_permission('console.access'))
  );

create policy platform_admins_insert on public.platform_admins
  for insert to authenticated
  with check ((select public.has_platform_permission('admins.manage')));

create policy platform_admins_update on public.platform_admins
  for update to authenticated
  using ((select public.has_platform_permission('admins.manage')))
  with check ((select public.has_platform_permission('admins.manage')));

create policy platform_admins_delete on public.platform_admins
  for delete to authenticated
  using ((select public.has_platform_permission('admins.manage')));

create function public.platform_admin_list()
returns table (user_id uuid, email text, display_name text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('console.access') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select pa.user_id, u.email::text, pr.display_name, pa.role, pa.created_at, u.last_sign_in_at
    from public.platform_admins pa
    join auth.users u on u.id = pa.user_id
    left join public.profiles pr on pr.id = pa.user_id
    order by pa.created_at;
end;
$$;

revoke all on function public.platform_admin_list() from public, anon;
grant execute on function public.platform_admin_list() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared data now follows the role, not bare membership of platform_admins
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['vehicle_makes', 'vehicle_models', 'vehicle_model_years', 'vehicle_variants']
  loop
    execute format('drop policy %I on public.%I', t || '_manage', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.has_platform_permission(''catalog.manage'')))
         with check ((select public.has_platform_permission(''catalog.manage'')))',
      t || '_manage', t
    );
  end loop;
end;
$$;

drop policy roles_manage on public.roles;
drop policy role_permissions_manage on public.role_permissions;

create policy roles_manage on public.roles for all to authenticated
  using ((select public.has_platform_permission('roles.manage')))
  with check ((select public.has_platform_permission('roles.manage')) and is_system = false);

create policy role_permissions_manage on public.role_permissions for all to authenticated
  using ((select public.has_platform_permission('roles.manage')))
  with check ((select public.has_platform_permission('roles.manage')));

-- ---------------------------------------------------------------------------
-- Audit log. Separate from audit_logs on purpose: that table holds a dealership's private history,
-- and letting platform staff read it would break the boundary this log exists to record.
-- ---------------------------------------------------------------------------

create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  tenant_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.platform_audit_logs is
  'Append-only record of platform administration. actor_id is null for system jobs, and neither ID is a foreign key so entries outlive what they describe.';

create index platform_audit_logs_created_at_idx on public.platform_audit_logs (created_at desc);
create index platform_audit_logs_tenant_id_idx on public.platform_audit_logs (tenant_id, created_at desc);

create function public.platform_audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform audit entries cannot be changed' using errcode = '42501';
end;
$$;

create trigger platform_audit_logs_append_only
before update or delete on public.platform_audit_logs
for each row execute function public.platform_audit_logs_append_only();

alter table public.platform_audit_logs enable row level security;
revoke all on public.platform_audit_logs from anon, authenticated;
grant select on public.platform_audit_logs to authenticated;
grant select, insert on public.platform_audit_logs to service_role;

create policy platform_audit_logs_select on public.platform_audit_logs
  for select to authenticated
  using ((select public.has_platform_permission('audit.view')));

-- Records one event. Internal: reachable from definer functions and triggers only.
create function public.platform_log(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_tenant_id uuid,
  p_old jsonb default null,
  p_new jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.platform_audit_logs (actor_id, action, target_type, target_id, tenant_id, old_values, new_values, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_tenant_id, p_old, p_new, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke all on function public.platform_log(text, text, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.platform_log(text, text, uuid, uuid, jsonb, jsonb, jsonb) to service_role;

-- For steps only the server can do, such as creating a login. Platform staff only.
create function public.platform_record_event(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_scope_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('console.access') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform public.platform_log(p_action, p_target_type, p_target_id, p_scope_id, null, null, p_metadata);
end;
$$;

revoke all on function public.platform_record_event(text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.platform_record_event(text, text, uuid, uuid, jsonb) to authenticated, service_role;

-- Every change to an administered table, however it was made.
create function public.platform_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  perform public.platform_log(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'plan_id', v_row ->> 'user_id', v_row ->> 'tenant_id')::uuid,
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid else (v_row ->> 'tenant_id')::uuid end,
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.platform_audit_row() from public, anon, authenticated;

create trigger platform_audit_row after insert or update or delete on public.platform_admins
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update on public.tenants
  for each row execute function public.platform_audit_row();

-- ---------------------------------------------------------------------------
-- Dealerships: platform staff administer the row. Dealership staff keep read-only access to their
-- own, and every other row stays hidden from them.
-- ---------------------------------------------------------------------------

grant insert, update on public.tenants to authenticated;

create policy tenants_platform_select on public.tenants
  for select to authenticated
  using ((select public.has_platform_permission('tenants.view')));

create policy tenants_platform_insert on public.tenants
  for insert to authenticated
  with check ((select public.has_platform_permission('tenants.manage')));

create policy tenants_platform_update on public.tenants
  for update to authenticated
  using ((select public.has_platform_permission('tenants.manage')))
  with check ((select public.has_platform_permission('tenants.manage')));
