-- Phase 4 authorization helpers.
-- SECURITY DEFINER functions bypass RLS on profiles/user_roles/permissions to avoid recursion.
-- Always set search_path and restrict EXECUTE to authenticated (or revoke from public).

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.deleted_at is null
      and p.status = 'active'
  );
$$;

comment on function public.is_active_staff() is
  'True when the JWT user has an active, non-deleted profile.';

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.branch_id
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff()
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and r.key = 'super_admin'
    );
$$;

create or replace function public.has_role(role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff()
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and r.key = role_key
    );
$$;

-- Global permission check (any branch scope or global assignment).
create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or (
      public.is_active_staff()
      and exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = auth.uid()
          and p.key = permission_key
      )
    );
$$;

-- Branch-scoped permission: global role assignment OR matching branch_id.
create or replace function public.has_permission_for_branch(
  permission_key text,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_branch_id is not null
    and (
      public.is_super_admin()
      or (
        public.is_active_staff()
        and exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id
          where ur.user_id = auth.uid()
            and p.key = permission_key
            and (ur.branch_id is null or ur.branch_id = target_branch_id)
        )
      )
    );
$$;

-- True when the user may access a branch via any role assignment (or super admin).
create or replace function public.can_access_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_branch_id is not null
    and (
      public.is_super_admin()
      or (
        public.is_active_staff()
        and (
          exists (
            select 1
            from public.user_roles ur
            where ur.user_id = auth.uid()
              and (ur.branch_id is null or ur.branch_id = target_branch_id)
          )
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.deleted_at is null
              and p.status = 'active'
              and p.branch_id = target_branch_id
              and not exists (
                select 1 from public.user_roles ur2 where ur2.user_id = auth.uid()
              )
          )
        )
      )
    );
$$;

-- Nullable branch rows (e.g. customers.branch_id): allow when null only with permission globally.
create or replace function public.has_permission_for_optional_branch(
  permission_key text,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when target_branch_id is null then public.has_permission(permission_key)
      else public.has_permission_for_branch(permission_key, target_branch_id)
    end;
$$;

create or replace function public.current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.key order by p.key), '{}'::text[])
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and public.is_active_staff();
$$;

create or replace function public.current_user_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct r.key order by r.key), '{}'::text[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and public.is_active_staff();
$$;

-- Invited users activate themselves after setting a password (no privilege escalation).
create or replace function public.activate_invited_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set status = 'active',
      updated_at = timezone('utc', now())
  where id = auth.uid()
    and deleted_at is null
    and status = 'invited';

  if not found then
    -- Already active is fine; suspended/disabled must fail.
    if exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active' and deleted_at is null
    ) then
      return;
    end if;
    raise exception 'profile cannot be activated';
  end if;
end;
$$;

-- Controlled role assignment (blocks self-escalation and unauthorized super_admin grants).
create or replace function public.assign_user_role(
  target_user_id uuid,
  role_key text,
  target_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_assignment_id uuid;
begin
  if not public.has_permission('role.manage') then
    raise exception 'not authorized';
  end if;

  if target_user_id = auth.uid() and role_key = 'super_admin' then
    raise exception 'cannot self-assign super_admin';
  end if;

  if role_key = 'super_admin' and not public.is_super_admin() then
    raise exception 'only super admin can assign super_admin';
  end if;

  select id into v_role_id from public.roles where key = role_key;
  if v_role_id is null then
    raise exception 'unknown role';
  end if;

  select id into v_assignment_id
  from public.user_roles
  where user_id = target_user_id
    and role_id = v_role_id
    and branch_id is not distinct from target_branch_id;

  if v_assignment_id is null then
    insert into public.user_roles (user_id, role_id, branch_id, assigned_by)
    values (target_user_id, v_role_id, target_branch_id, auth.uid())
    returning id into v_assignment_id;
  end if;

  perform public.write_audit_log(
    'USER_ROLE_ASSIGNED',
    'user_roles',
    v_assignment_id,
    null,
    jsonb_build_object(
      'user_id', target_user_id,
      'role_key', role_key,
      'branch_id', target_branch_id
    )
  );

  return v_assignment_id;
end;
$$;

create or replace function public.revoke_user_role(assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_roles%rowtype;
  v_role_key text;
begin
  if not public.has_permission('role.manage') then
    raise exception 'not authorized';
  end if;

  select * into v_row from public.user_roles where id = assignment_id;
  if not found then
    raise exception 'assignment not found';
  end if;

  select key into v_role_key from public.roles where id = v_row.role_id;

  if v_role_key = 'super_admin' and not public.is_super_admin() then
    raise exception 'only super admin can revoke super_admin';
  end if;

  if v_row.user_id = auth.uid() and v_role_key = 'super_admin' then
    raise exception 'cannot revoke own super_admin role';
  end if;

  delete from public.user_roles where id = assignment_id;

  perform public.write_audit_log(
    'USER_ROLE_REMOVED',
    'user_roles',
    assignment_id,
    jsonb_build_object(
      'user_id', v_row.user_id,
      'role_key', v_role_key,
      'branch_id', v_row.branch_id
    ),
    null
  );
end;
$$;

-- Financial field accessors (column grants withhold these from direct table SELECT).
create or replace function public.read_vehicle_costs(p_vehicle_id uuid)
returns table (
  total_acquisition_cost numeric,
  minimum_selling_price numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select v.branch_id into v_branch
  from public.vehicles v
  where v.id = p_vehicle_id and v.deleted_at is null;

  if v_branch is null then
    return;
  end if;

  if not public.has_permission_for_branch('vehicle.cost.view', v_branch) then
    raise exception 'not authorized';
  end if;

  return query
  select v.total_acquisition_cost, v.minimum_selling_price
  from public.vehicles v
  where v.id = p_vehicle_id;
end;
$$;

create or replace function public.read_vehicle_profit(p_vehicle_id uuid)
returns table (
  total_acquisition_cost numeric,
  current_selling_price numeric,
  minimum_selling_price numeric,
  estimated_margin numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select v.branch_id into v_branch
  from public.vehicles v
  where v.id = p_vehicle_id and v.deleted_at is null;

  if v_branch is null then
    return;
  end if;

  if not public.has_permission_for_branch('vehicle.profit.view', v_branch) then
    raise exception 'not authorized';
  end if;

  return query
  select
    v.total_acquisition_cost,
    v.current_selling_price,
    v.minimum_selling_price,
    case
      when v.current_selling_price is null then null
      else v.current_selling_price - v.total_acquisition_cost
    end
  from public.vehicles v
  where v.id = p_vehicle_id;
end;
$$;

revoke all on function public.is_active_staff() from public;
revoke all on function public.current_branch_id() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.has_role(text) from public;
revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission_for_branch(text, uuid) from public;
revoke all on function public.can_access_branch(uuid) from public;
revoke all on function public.has_permission_for_optional_branch(text, uuid) from public;
revoke all on function public.current_user_permissions() from public;
revoke all on function public.current_user_roles() from public;
revoke all on function public.activate_invited_profile() from public;
revoke all on function public.assign_user_role(uuid, text, uuid) from public;
revoke all on function public.revoke_user_role(uuid) from public;
revoke all on function public.read_vehicle_costs(uuid) from public;
revoke all on function public.read_vehicle_profit(uuid) from public;

grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.current_branch_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.has_permission_for_branch(text, uuid) to authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated;
grant execute on function public.has_permission_for_optional_branch(text, uuid) to authenticated;
grant execute on function public.current_user_permissions() to authenticated;
grant execute on function public.current_user_roles() to authenticated;
grant execute on function public.activate_invited_profile() to authenticated;
grant execute on function public.assign_user_role(uuid, text, uuid) to authenticated;
grant execute on function public.revoke_user_role(uuid) to authenticated;
grant execute on function public.read_vehicle_costs(uuid) to authenticated;
grant execute on function public.read_vehicle_profit(uuid) to authenticated;
