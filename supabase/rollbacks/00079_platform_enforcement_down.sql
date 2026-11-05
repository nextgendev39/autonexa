-- Reverses 00079: features and limits stop being enforced, and subscriptions stop expiring.

create or replace function public.cancel_unpaid_bookings(p_tenant_id uuid)
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
      and (p_tenant_id is null or r.tenant_id = p_tenant_id)
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

create or replace function public.notify_overdue_balances(p_tenant_id uuid)
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
      and (p_tenant_id is null or r.tenant_id = p_tenant_id)
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

drop function public.platform_subscription_sweep();
drop function public.current_tenant_plan();
drop trigger a2_plan_limit on public.staff_documents;
drop trigger a2_plan_limit on public.documents;
drop trigger a2_plan_limit on public.vehicle_photos;
drop trigger a2_plan_limit on public.tenant_members;
drop trigger a2_plan_limit on public.branches;
drop trigger a2_plan_limit on public.vehicles;
drop function public.guard_storage_limit();
drop function public.guard_user_limit();
drop function public.guard_branch_limit();
drop function public.guard_vehicle_limit();
drop function public.enforce_tenant_limit(uuid, text, bigint);
drop function public.current_tenant_limit(text, bigint);
drop function public.tenant_limit_state(uuid, text, bigint);
drop function public.current_tenant_disabled_features();

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

drop function public.permission_feature_enabled(text);
drop function public.tenant_feature_enabled(uuid, text);
