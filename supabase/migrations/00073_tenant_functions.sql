-- SaaS Phase 1: make the permission functions and privileged RPCs tenant-aware.
-- Definer functions bypass RLS, so tenant policies alone cannot protect them. For Zohaan Motors
-- as the only tenant, every result stays the same.
-- auth.uid() is null only for privileged server code (sweeps, triggers run by it), which works
-- across dealerships by design and attributes rows from the data, never from a request.
-- Rollback: supabase/rollbacks/00073_tenant_functions_down.sql

-- ---------------------------------------------------------------------------
-- Who is acting
-- ---------------------------------------------------------------------------

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select (select public.current_tenant_id()) is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.status = 'active'
    );
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
        and ur.tenant_id = (select public.current_tenant_id())
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
        and ur.tenant_id = (select public.current_tenant_id())
        and r.key = role_key
    );
$$;

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
          and ur.tenant_id = (select public.current_tenant_id())
          and p.key = permission_key
      )
    );
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
    and ur.tenant_id = (select public.current_tenant_id())
    and public.is_active_staff();
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
    and ur.tenant_id = (select public.current_tenant_id())
    and public.is_active_staff();
$$;

-- ---------------------------------------------------------------------------
-- Branch checks: a branch in another dealership is never accessible, even to its
-- own super_admin. Everything gated on a record's branch is protected by this.
-- ---------------------------------------------------------------------------

create or replace function public.can_access_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select
    target_branch_id is not null
    and exists (
      select 1 from public.branches b
      where b.id = target_branch_id and b.tenant_id = (select public.current_tenant_id())
    )
    and (
      public.is_super_admin()
      or (
        public.is_active_staff()
        and (
          exists (
            select 1
            from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.tenant_id = (select public.current_tenant_id())
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
                select 1 from public.user_roles ur2
                where ur2.user_id = auth.uid() and ur2.tenant_id = (select public.current_tenant_id())
              )
          )
        )
      )
    );
$$;

create or replace function public.has_permission_for_branch(permission_key text, target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select
    target_branch_id is not null
    and exists (
      select 1 from public.branches b
      where b.id = target_branch_id and b.tenant_id = (select public.current_tenant_id())
    )
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
            and ur.tenant_id = (select public.current_tenant_id())
            and p.key = permission_key
            and (ur.branch_id is null or ur.branch_id = target_branch_id)
        )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Functions that read a record directly
-- ---------------------------------------------------------------------------

-- Customers may have no branch, so the branch check alone cannot protect them.
create or replace function public.can_access_customer_storage(p_customer_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.tenant_id = (select public.current_tenant_id())
      and c.deleted_at is null
      and (
        (not p_write and public.has_permission_for_optional_branch('document.view', c.branch_id))
        or (p_write and public.has_permission_for_optional_branch('document.create', c.branch_id))
      )
  );
$$;

create or replace function public.acquisition_expense_sum(p_acquisition_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
select coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.vehicle_expenses e
  where e.acquisition_id = p_acquisition_id
    and e.category is distinct from 'purchase'
    and (auth.uid() is null or e.tenant_id = (select public.current_tenant_id()));
$$;

create or replace function public.acquisition_total_cost(p_acquisition_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
select (
    coalesce(
      (select a.purchase_price from public.acquisitions a where a.id = p_acquisition_id and (auth.uid() is null or a.tenant_id = (select public.current_tenant_id()))),
      0
    )
    + public.acquisition_expense_sum(p_acquisition_id)
  )::numeric(14, 2);
$$;

create or replace function public.vehicle_other_expense_cost(p_vehicle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
-- Expenses not tied to an acquisition (acquisition already rolled into total_acquisition_cost).
  select coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.vehicle_expenses e
  where e.vehicle_id = p_vehicle_id
    and e.acquisition_id is null
    and (auth.uid() is null or e.tenant_id = (select public.current_tenant_id()));
$$;

create or replace function public.vehicle_root_id(p_vehicle_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
with recursive chain as (
    select v.id, v.split_from_id, 0 as depth
    from public.vehicles v
    where v.id = p_vehicle_id
      and (auth.uid() is null or v.tenant_id = (select public.current_tenant_id()))
    union all
    select v.id, v.split_from_id, c.depth + 1
    from public.vehicles v
    join chain c on v.id = c.split_from_id
    where c.depth < 50
  )
  select case
    when not exists (select 1 from chain) and auth.uid() is not null then null
    else coalesce((select id from chain where split_from_id is null limit 1), p_vehicle_id)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Roles: both the person and the branch must be in the caller's dealership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_user_role(target_user_id uuid, role_key text, target_branch_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not exists (
    select 1 from public.tenant_members m
    where m.user_id = target_user_id
      and m.tenant_id = public.current_tenant_id()
      and m.status = 'active'
  ) then
    raise exception 'user not found';
  end if;

  if target_branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = target_branch_id and b.tenant_id = public.current_tenant_id()
  ) then
    raise exception 'branch not found';
  end if;

  select id into v_assignment_id
  from public.user_roles
  where user_id = target_user_id
    and role_id = v_role_id
    and branch_id is not distinct from target_branch_id
    and tenant_id = public.current_tenant_id();

  if v_assignment_id is null then
    insert into public.user_roles (tenant_id, user_id, role_id, branch_id, assigned_by)
    values (public.current_tenant_id(), target_user_id, v_role_id, target_branch_id, auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.user_roles%rowtype;
  v_role_key text;
begin
  if not public.has_permission('role.manage') then
    raise exception 'not authorized';
  end if;

  select * into v_row from public.user_roles
  where id = assignment_id and tenant_id = public.current_tenant_id();
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
$function$;

-- ---------------------------------------------------------------------------
-- Audit log: a caller's own dealership wins, so a client cannot write into another's.
-- Without a user session the audited row says where the entry belongs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.write_audit_log(p_action text, p_entity_type text, p_entity_id uuid, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  log_id uuid;
begin
  insert into public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  )
  values (
    coalesce(
      public.current_tenant_id(),
      (p_new_values ->> 'tenant_id')::uuid,
      (p_old_values ->> 'tenant_id')::uuid,
      public.resolve_insert_tenant_id()
    ),
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into log_id;

  return log_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Record numbers: each dealership has its own prefix and counters
-- ---------------------------------------------------------------------------

create function public.next_tenant_number(p_tenant_id uuid, p_key text, p_infix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  n bigint;
begin
  select number_prefix into v_prefix from public.tenants where id = p_tenant_id;
  if v_prefix is null then
    raise exception 'unknown tenant';
  end if;

  -- The row lock makes this race-safe; contention stays within one dealership.
  insert into public.tenant_counters (tenant_id, key, value)
  values (p_tenant_id, p_key, 1)
  on conflict (tenant_id, key) do update set value = public.tenant_counters.value + 1
  returning value into n;

  return v_prefix || '-' || p_infix || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_tenant_number(uuid, text, text) from public, anon, authenticated;

create or replace function public.next_vehicle_stock_number()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_tenant_number(public.resolve_insert_tenant_id(), 'vehicle_stock', '');
$$;

create or replace function public.next_acquisition_number()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_tenant_number(public.resolve_insert_tenant_id(), 'acquisition', 'ACQ-');
$$;

CREATE OR REPLACE FUNCTION public.vehicles_assign_stock_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stock_number is null or length(trim(new.stock_number)) = 0 then
    new.stock_number := public.next_tenant_number(new.tenant_id, 'vehicle_stock', '');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.acquisitions_assign_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.acquisition_number is null or length(trim(new.acquisition_number)) = 0 then
    new.acquisition_number := public.next_tenant_number(new.tenant_id, 'acquisition', 'ACQ-');
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Settings and background jobs: each dealership's own terms and recipients
-- ---------------------------------------------------------------------------

create function public.tenant_term_minutes(p_tenant_id uuid, p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 1 and 525600
          then (value #>> '{}')::numeric::integer
      end
      from public.system_settings
      where key = p_key
        and tenant_id = p_tenant_id
    ),
    p_default
  );
$$;

revoke all on function public.tenant_term_minutes(uuid, text, integer) from public, anon, authenticated;

create or replace function public.booking_term_minutes(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
select public.tenant_term_minutes(public.resolve_insert_tenant_id(), p_key, p_default);
$$;

create or replace function public.active_super_admin_ids(p_tenant_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
select pr.id
  from public.profiles pr
  where pr.status = 'active'
    and pr.deleted_at is null
    and pr.tenant_id = p_tenant_id
    and exists (
      select 1
      from public.user_roles ur
      join public.roles ro on ro.id = ur.role_id
      where ur.user_id = pr.id
        and ur.tenant_id = p_tenant_id
        and ro.key = 'super_admin'
    );
$$;

revoke all on function public.active_super_admin_ids(uuid) from public, anon, authenticated;
grant execute on function public.active_super_admin_ids(uuid) to service_role;

-- The deployed app calls this without an argument. With several dealerships it finds no
-- single tenant and returns nobody, so an unattributed alert cannot reach the wrong admins.
create or replace function public.active_super_admin_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
select public.active_super_admin_ids(public.resolve_insert_tenant_id());
$$;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_count integer := 0;
  v_minutes integer;
  v_reason text;
  v_vehicle_id uuid;
  v_stock_number text;
begin
  perform set_config('app.vehicle_status_reason', 'booking_deposit_not_received', true);

  for v_row in
    select
      r.id,
      r.tenant_id,
      r.reservation_number,
      r.vehicle_id,
      r.reserved_at,
      v.stock_number,
      concat_ws(' ', v.year, v.make, v.model) as vehicle_title,
      c.display_name as customer_name,
      p.display_name as salesperson_name
    from public.reservations r
    join public.vehicles v on v.id = r.vehicle_id
    left join public.customers c on c.id = r.customer_id
    left join public.profiles p on p.id = r.salesperson_id
    where r.status = 'active'
      and r.amount <= 0
      and r.reserved_at <= now() - make_interval(
        mins => public.tenant_term_minutes(r.tenant_id, 'booking.deposit_minutes', 4320)
      )
      and (r.cancellation_hold_status is null or r.cancellation_hold_status = 'rejected')
    for update of r skip locked
  loop
    v_minutes := public.tenant_term_minutes(v_row.tenant_id, 'booking.deposit_minutes', 4320);
    v_reason := format('Deposit not received within %s', public.format_minutes(v_minutes));

    update public.reservations
    set status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = v_reason,
        auto_cancelled = true
    where id = v_row.id;

    update public.vehicles
    set status = 'ready_for_sale'
    where id = v_row.vehicle_id
      and status = 'reserved';

    -- Units split off for this booking rejoin the Ready for sale record they came from.
    v_vehicle_id := public.merge_ready_split_units(v_row.vehicle_id);
    select stock_number into v_stock_number from public.vehicles where id = v_vehicle_id;

    insert into public.notifications (user_id, type, title, message, entity_type, entity_id, data)
    select
      admin_id,
      'booking_auto_cancelled',
      'Booking cancelled: no deposit',
      format(
        'Booking %s (%s) was cancelled because no deposit was received within %s. The car is Ready for sale again.',
        v_row.reservation_number,
        coalesce(nullif(v_row.vehicle_title, ''), v_stock_number, 'vehicle'),
        public.format_minutes(v_minutes)
      ),
      'reservation',
      v_row.id,
      jsonb_build_object(
        'bookingNumber', v_row.reservation_number,
        'vehicleId', v_vehicle_id,
        'vehicleTitle', v_row.vehicle_title,
        'stockNumber', v_stock_number,
        'customerName', v_row.customer_name,
        'salespersonName', v_row.salesperson_name,
        'reservedAt', v_row.reserved_at,
        'deadlineMinutes', v_minutes
      )
    from public.active_super_admin_ids(v_row.tenant_id) as admin_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_overdue_balances()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_count integer := 0;
  v_minutes integer;
begin
  for v_row in
    select
      r.id,
      r.tenant_id,
      r.reservation_number,
      r.vehicle_id,
      r.salesperson_id,
      r.reserved_at,
      r.currency,
      round(r.selling_price * coalesce(v.quantity, 1), 2) as total,
      r.amount + coalesce(r.balance_received, 0) as paid,
      v.stock_number,
      concat_ws(' ', v.year, v.make, v.model) as vehicle_title,
      c.display_name as customer_name,
      p.display_name as salesperson_name,
      p.status = 'active' and p.deleted_at is null as salesperson_active
    from public.reservations r
    join public.vehicles v on v.id = r.vehicle_id
    left join public.customers c on c.id = r.customer_id
    left join public.profiles p on p.id = r.salesperson_id
    where r.status in ('active', 'converted')
      and r.balance_overdue_notified_at is null
      and r.selling_price is not null
      and r.reserved_at <= now() - make_interval(
        mins => public.tenant_term_minutes(r.tenant_id, 'booking.balance_minutes', 10080)
      )
      and r.amount + coalesce(r.balance_received, 0) < round(r.selling_price * coalesce(v.quantity, 1), 2)
    for update of r skip locked
  loop
    v_minutes := public.tenant_term_minutes(v_row.tenant_id, 'booking.balance_minutes', 10080);

    update public.reservations
    set balance_overdue_notified_at = now()
    where id = v_row.id;

    insert into public.notifications (user_id, type, title, message, entity_type, entity_id, data)
    select
      recipient,
      'booking_balance_overdue',
      'Full payment overdue',
      format(
        'Booking %s (%s) has not been paid in full within %s. Outstanding: %s %s.',
        v_row.reservation_number,
        coalesce(nullif(v_row.vehicle_title, ''), v_row.stock_number, 'vehicle'),
        public.format_minutes(v_minutes),
        v_row.currency,
        to_char(v_row.total - v_row.paid, 'FM999,999,999,990.00')
      ),
      'reservation',
      v_row.id,
      jsonb_build_object(
        'bookingNumber', v_row.reservation_number,
        'vehicleId', v_row.vehicle_id,
        'vehicleTitle', v_row.vehicle_title,
        'stockNumber', v_row.stock_number,
        'customerName', v_row.customer_name,
        'salespersonName', v_row.salesperson_name,
        'reservedAt', v_row.reserved_at,
        'deadlineMinutes', v_minutes,
        'currency', v_row.currency,
        'total', v_row.total,
        'paid', v_row.paid,
        'outstanding', v_row.total - v_row.paid
      )
    from (
      select admin_id as recipient from public.active_super_admin_ids(v_row.tenant_id) as admin_id
      union
      select v_row.salesperson_id where v_row.salesperson_id is not null and v_row.salesperson_active
    ) recipients;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- A user cannot move their own profile to another dealership.
CREATE OR REPLACE FUNCTION public.profiles_guard_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id = auth.uid() and not public.has_permission('user.manage') then
    if new.status is distinct from old.status
       or new.branch_id is distinct from old.branch_id
       or new.deleted_at is distinct from old.deleted_at
       or new.employee_code is distinct from old.employee_code
       or new.tenant_id is distinct from old.tenant_id then
      raise exception 'not authorized to change protected profile fields';
    end if;
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- The Users screen: login details for one dealership, without listing every auth user
-- ---------------------------------------------------------------------------

create function public.tenant_member_auth_details(p_tenant_id uuid)
returns table (user_id uuid, email text, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, u.last_sign_in_at
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant_id;
$$;

revoke all on function public.tenant_member_auth_details(uuid) from public, anon, authenticated;
grant execute on function public.tenant_member_auth_details(uuid) to service_role;
