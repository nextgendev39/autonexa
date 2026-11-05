-- Rollback of 00073. Run manually, only with approval. Restores each function's exact
-- previous definition, captured from the schema as of migration 00069.
-- New record numbers keep counting: 00070's rollback moves the old sequences past them.

CREATE OR REPLACE FUNCTION public.is_active_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.deleted_at is null
      and p.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_active_staff()
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and r.key = 'super_admin'
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.has_role(role_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_active_staff()
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and r.key = role_key
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_branch(target_branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.has_permission_for_branch(permission_key text, target_branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.current_user_roles()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct r.key order by r.key), '{}'::text[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and public.is_active_staff();
$function$;

CREATE OR REPLACE FUNCTION public.current_user_permissions()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct p.key order by p.key), '{}'::text[])
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and public.is_active_staff();
$function$;

CREATE OR REPLACE FUNCTION public.active_super_admin_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pr.id
  from public.profiles pr
  where pr.status = 'active'
    and pr.deleted_at is null
    and exists (
      select 1
      from public.user_roles ur
      join public.roles ro on ro.id = ur.role_id
      where ur.user_id = pr.id
        and ro.key = 'super_admin'
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_customer_storage(p_customer_id uuid, p_write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.deleted_at is null
      and (
        (not p_write and public.has_permission_for_optional_branch('document.view', c.branch_id))
        or (p_write and public.has_permission_for_optional_branch('document.create', c.branch_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.acquisition_expense_sum(p_acquisition_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(amount), 0)::numeric(14, 2)
  from public.vehicle_expenses
  where acquisition_id = p_acquisition_id
    and category is distinct from 'purchase';
$function$;

CREATE OR REPLACE FUNCTION public.acquisition_total_cost(p_acquisition_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce((select purchase_price from public.acquisitions where id = p_acquisition_id), 0)
    + public.acquisition_expense_sum(p_acquisition_id)
  )::numeric(14, 2);
$function$;

CREATE OR REPLACE FUNCTION public.vehicle_other_expense_cost(p_vehicle_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Expenses not tied to an acquisition (acquisition already rolled into total_acquisition_cost).
  select coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.vehicle_expenses e
  where e.vehicle_id = p_vehicle_id
    and e.acquisition_id is null;
$function$;

CREATE OR REPLACE FUNCTION public.vehicle_root_id(p_vehicle_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive chain as (
    select id, split_from_id, 0 as depth
    from public.vehicles
    where id = p_vehicle_id
    union all
    select v.id, v.split_from_id, c.depth + 1
    from public.vehicles v
    join chain c on v.id = c.split_from_id
    where c.depth < 50
  )
  select coalesce((select id from chain where split_from_id is null limit 1), p_vehicle_id);
$function$;

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
$function$;

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
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  )
  values (
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

CREATE OR REPLACE FUNCTION public.next_vehicle_stock_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n bigint;
begin
  n := nextval('public.vehicle_stock_number_seq');
  return 'ZM-' || lpad(n::text, 6, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.next_acquisition_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n bigint;
begin
  n := nextval('public.acquisition_number_seq');
  return 'ZM-ACQ-' || lpad(n::text, 6, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.vehicles_assign_stock_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.stock_number is null or length(trim(new.stock_number)) = 0 then
    new.stock_number := public.next_vehicle_stock_number();
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
    new.acquisition_number := public.next_acquisition_number();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.booking_term_minutes(p_key text, p_default integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select case
        when jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 1 and 525600
          then (value #>> '{}')::numeric::integer
      end
      from public.system_settings
      where key = p_key
    ),
    p_default
  );
$function$;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_count integer := 0;
  v_minutes integer := public.booking_term_minutes('booking.deposit_minutes', 4320);
  v_reason text := format('Deposit not received within %s', public.format_minutes(v_minutes));
  v_vehicle_id uuid;
  v_stock_number text;
begin
  perform set_config('app.vehicle_status_reason', 'booking_deposit_not_received', true);

  for v_row in
    select
      r.id,
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
      and r.reserved_at <= now() - make_interval(mins => v_minutes)
      and (r.cancellation_hold_status is null or r.cancellation_hold_status = 'rejected')
    for update of r skip locked
  loop
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
    from public.active_super_admin_ids() as admin_id;

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
  v_minutes integer := public.booking_term_minutes('booking.balance_minutes', 10080);
begin
  for v_row in
    select
      r.id,
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
      and r.reserved_at <= now() - make_interval(mins => v_minutes)
      and r.amount + coalesce(r.balance_received, 0) < round(r.selling_price * coalesce(v.quantity, 1), 2)
    for update of r skip locked
  loop
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
      select admin_id as recipient from public.active_super_admin_ids() as admin_id
      union
      select v_row.salesperson_id where v_row.salesperson_id is not null and v_row.salesperson_active
    ) recipients;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

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
       or new.employee_code is distinct from old.employee_code then
      raise exception 'not authorized to change protected profile fields';
    end if;
  end if;

  return new;
end;
$function$;

drop function public.tenant_member_auth_details(uuid);
drop function public.active_super_admin_ids(uuid);
drop function public.tenant_term_minutes(uuid, text, integer);
drop function public.next_tenant_number(uuid, text, text);
