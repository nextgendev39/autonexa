-- SaaS Phase 3: plans start to matter. Features are enforced in has_permission*, the one place every
-- policy and definer function already goes through. Limits are enforced by triggers, so no path
-- around the app can exceed them. A dealership with no subscription row is not limited, and
-- Zohaan's Enterprise plan has no limits and every feature, so existing behaviour does not change.
-- An expired or cancelled subscription keeps existing records readable and pauses only new ones.
-- Rollback: supabase/rollbacks/00079_platform_enforcement_down.sql

-- ---------------------------------------------------------------------------
-- Features
-- ---------------------------------------------------------------------------

create function public.tenant_feature_enabled(p_tenant_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(pf.enabled, false)
      from (
        select s.plan_id from public.tenant_subscriptions s
        where s.tenant_id = p_tenant_id
        order by s.created_at desc, s.id
        limit 1
      ) latest
      left join public.plan_features pf on pf.plan_id = latest.plan_id and pf.feature_key = p_feature
    ),
    true
  );
$$;

create function public.permission_feature_enabled(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.platform_features f
    where split_part(p_permission, '.', 1) = any (f.permission_modules)
      and not public.tenant_feature_enabled(public.current_tenant_id(), f.key)
  );
$$;

revoke all on function public.tenant_feature_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.tenant_feature_enabled(uuid, text) to service_role;
revoke all on function public.permission_feature_enabled(text) from public, anon;
grant execute on function public.permission_feature_enabled(text) to authenticated, service_role;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select public.permission_feature_enabled(permission_key)
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
    public.permission_feature_enabled(permission_key)
    and target_branch_id is not null
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
    and public.is_active_staff()
    and public.permission_feature_enabled(p.key);
$$;

create function public.current_tenant_disabled_features()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(f.key order by f.key), '{}'::text[])
  from public.platform_features f
  where public.current_tenant_id() is not null
    and not public.tenant_feature_enabled(public.current_tenant_id(), f.key);
$$;

revoke all on function public.current_tenant_disabled_features() from public, anon;
grant execute on function public.current_tenant_disabled_features() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

-- Whether a dealership can add to a limit: the one rule behind both the trigger and the app's check.
create function public.tenant_limit_state(p_tenant_id uuid, p_key text, p_adding bigint default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan_id uuid;
  v_plan public.plans%rowtype;
  v_limit bigint;
  v_used bigint;
begin
  if p_key not in ('users', 'branches', 'vehicles', 'storage') then
    raise exception 'unknown limit' using errcode = '22023';
  end if;

  select s.status, s.plan_id into v_status, v_plan_id
  from public.tenant_subscriptions s
  where s.tenant_id = p_tenant_id
  order by s.created_at desc, s.id
  limit 1;

  if v_status is null then
    return jsonb_build_object('allowed', true, 'reason', null, 'limit', null);
  end if;
  select * into v_plan from public.plans where id = v_plan_id;
  if v_status in ('expired', 'cancelled') then
    return jsonb_build_object('allowed', false, 'reason', 'subscription_inactive', 'limit', null);
  end if;

  v_limit := case p_key
    when 'users' then v_plan.max_users
    when 'branches' then v_plan.max_branches
    when 'vehicles' then v_plan.max_vehicles
    when 'storage' then v_plan.max_storage_mb::bigint * 1024 * 1024
  end;
  if v_limit is null then
    return jsonb_build_object('allowed', true, 'reason', null, 'limit', null);
  end if;

  select case p_key
      when 'users' then u.users
      when 'branches' then u.branches
      when 'vehicles' then u.vehicles
      when 'storage' then u.storage_bytes
    end
  into v_used
  from public.tenant_usage_counts(p_tenant_id) u;

  return jsonb_build_object(
    'allowed', v_used + coalesce(p_adding, 0) <= v_limit,
    'reason', case when v_used + coalesce(p_adding, 0) <= v_limit then null else 'plan_limit_exceeded' end,
    'limit', v_limit,
    'used', v_used
  );
end;
$$;

revoke all on function public.tenant_limit_state(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.tenant_limit_state(uuid, text, bigint) to service_role;

-- The app asks before starting work, for a clear message. The dealership is the caller's own.
create function public.current_tenant_limit(p_key text, p_adding bigint default 1)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_limit_state(public.current_tenant_id(), p_key, p_adding);
$$;

revoke all on function public.current_tenant_limit(text, bigint) from public, anon;
grant execute on function public.current_tenant_limit(text, bigint) to authenticated, service_role;

create function public.enforce_tenant_limit(p_tenant_id uuid, p_key text, p_adding bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
begin
  -- Serialises additions per dealership, so two at once can't both take the last place.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_key, 0));
  v_state := public.tenant_limit_state(p_tenant_id, p_key, p_adding);
  if not (v_state ->> 'allowed')::boolean then
    raise exception '%:%', v_state ->> 'reason', p_key using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.enforce_tenant_limit(uuid, text, bigint) from public, anon, authenticated;

create function public.guard_vehicle_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Splitting and merging units move stock between records and add none. Both run on the server.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.enforce_tenant_limit(new.tenant_id, 'vehicles', coalesce(new.quantity, 1));
  elsif coalesce(new.quantity, 1) > coalesce(old.quantity, 1) then
    perform public.enforce_tenant_limit(new.tenant_id, 'vehicles', coalesce(new.quantity, 1) - coalesce(old.quantity, 1));
  end if;
  return new;
end;
$$;

create function public.guard_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    perform public.enforce_tenant_limit(new.tenant_id, 'branches', 1);
  end if;
  return new;
end;
$$;

create function public.guard_user_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.tenant_members m where m.tenant_id = new.tenant_id and m.user_id = new.user_id
  ) then
    perform public.enforce_tenant_limit(new.tenant_id, 'users', 1);
  end if;
  return new;
end;
$$;

create function public.guard_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.file_size, 0) <= 0 then
    return new;
  end if;
  -- Split units share one file, so another row for the same path adds nothing.
  if tg_table_name = 'vehicle_photos' and exists (
    select 1 from public.vehicle_photos p
    where p.tenant_id = new.tenant_id and p.storage_path = new.storage_path
  ) then
    return new;
  end if;
  perform public.enforce_tenant_limit(new.tenant_id, 'storage', new.file_size);
  return new;
end;
$$;

revoke all on function public.guard_vehicle_limit() from public, anon, authenticated;
revoke all on function public.guard_branch_limit() from public, anon, authenticated;
revoke all on function public.guard_user_limit() from public, anon, authenticated;
revoke all on function public.guard_storage_limit() from public, anon, authenticated;

-- Named a2_ so they run once a0_tenant_from_parent has settled tenant_id.
create trigger a2_plan_limit before insert or update of quantity on public.vehicles
  for each row execute function public.guard_vehicle_limit();
create trigger a2_plan_limit before insert or update of is_active on public.branches
  for each row execute function public.guard_branch_limit();
create trigger a2_plan_limit before insert on public.tenant_members
  for each row execute function public.guard_user_limit();
create trigger a2_plan_limit before insert on public.vehicle_photos
  for each row execute function public.guard_storage_limit();
create trigger a2_plan_limit before insert on public.documents
  for each row execute function public.guard_storage_limit();
create trigger a2_plan_limit before insert on public.staff_documents
  for each row execute function public.guard_storage_limit();

-- A dealership's own plan and usage, for its Settings screen. Takes no ID.
create function public.current_tenant_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_result jsonb;
begin
  if v_tenant is null or not public.has_permission('settings.view') then
    return null;
  end if;
  select jsonb_build_object(
    'plan', p.name,
    'status', s.status,
    'periodEnd', s.current_period_end,
    'limits', jsonb_build_object(
      'users', p.max_users, 'branches', p.max_branches,
      'vehicles', p.max_vehicles, 'storageMb', p.max_storage_mb
    ),
    'usage', (
      select jsonb_build_object(
        'users', u.users, 'branches', u.branches, 'vehicles', u.vehicles, 'storageBytes', u.storage_bytes
      ) from public.tenant_usage_counts(v_tenant) u
    )
  ) into v_result
  from public.tenant_subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = v_tenant
  order by s.created_at desc, s.id
  limit 1;
  return v_result;
end;
$$;

revoke all on function public.current_tenant_plan() from public, anon;
grant execute on function public.current_tenant_plan() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Expiry. Notices at 14, 7 and 1 days. At the end of the period a subscription goes past due, and
-- expires once the plan's grace days have run out. Nothing here suspends a dealership: that stays a
-- person's decision.
-- ---------------------------------------------------------------------------

create function public.platform_subscription_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_days integer;
  v_notice integer;
  v_notices integer := 0;
  v_past_due integer := 0;
  v_expired integer := 0;
begin
  for v_row in
    select s.id, s.tenant_id, s.current_period_end, s.expiry_notice_days, p.name as plan_name
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status in ('trialing', 'active')
      and s.current_period_end is not null
      and s.current_period_end > now()
      and s.current_period_end <= now() + interval '14 days'
    for update of s skip locked
  loop
    v_days := ceil(extract(epoch from v_row.current_period_end - now()) / 86400)::integer;
    v_notice := case when v_days <= 1 then 1 when v_days <= 7 then 7 else 14 end;
    if v_row.expiry_notice_days is null or v_notice < v_row.expiry_notice_days then
      update public.tenant_subscriptions set expiry_notice_days = v_notice where id = v_row.id;
      perform public.notify_tenant_admins(
        v_row.tenant_id, 'subscription_expiring', 'Subscription ending soon',
        format('Your %s subscription ends on %s.', v_row.plan_name, to_char(v_row.current_period_end, 'DD Mon YYYY')),
        jsonb_build_object('plan', v_row.plan_name, 'periodEnd', v_row.current_period_end, 'days', v_days)
      );
      v_notices := v_notices + 1;
    end if;
  end loop;

  for v_row in
    select s.id, s.tenant_id, p.name as plan_name, p.grace_days
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status in ('trialing', 'active')
      and s.current_period_end <= now()
    for update of s skip locked
  loop
    update public.tenant_subscriptions set status = 'past_due' where id = v_row.id;
    perform public.notify_tenant_admins(
      v_row.tenant_id, 'subscription_past_due', 'Subscription period ended',
      format('Your %s subscription period has ended. Renew within %s days to avoid interruption.', v_row.plan_name, v_row.grace_days),
      jsonb_build_object('plan', v_row.plan_name, 'graceDays', v_row.grace_days)
    );
    v_past_due := v_past_due + 1;
  end loop;

  for v_row in
    select s.id, s.tenant_id, p.name as plan_name
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status = 'past_due'
      and s.current_period_end + make_interval(days => p.grace_days) <= now()
    for update of s skip locked
  loop
    update public.tenant_subscriptions set status = 'expired', ended_at = now() where id = v_row.id;
    perform public.notify_tenant_admins(
      v_row.tenant_id, 'subscription_expired', 'Subscription expired',
      format('Your %s subscription has expired. Existing records stay available, and new ones are paused until you renew.', v_row.plan_name),
      jsonb_build_object('plan', v_row.plan_name)
    );
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object('notices', v_notices, 'pastDue', v_past_due, 'expired', v_expired);
end;
$$;

revoke all on function public.platform_subscription_sweep() from public, anon, authenticated;
grant execute on function public.platform_subscription_sweep() to service_role;

-- ---------------------------------------------------------------------------
-- Booking sweeps skip suspended dealerships. Cancelling their bookings while they are locked out
-- would do real damage that reactivating could not undo.
-- ---------------------------------------------------------------------------

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
      -- Staff of a suspended dealership can't respond, so its deadlines wait until it returns.
      and exists (select 1 from public.tenants t where t.id = r.tenant_id and t.status = 'active')
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
      -- Staff of a suspended dealership can't respond, so its deadlines wait until it returns.
      and exists (select 1 from public.tenants t where t.id = r.tenant_id and t.status = 'active')
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

-- ---------------------------------------------------------------------------
-- As in 00075: nothing here is callable without logging in, trigger functions included.
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig, has_function_privilege('authenticated', p.oid, 'execute') as for_staff
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and (has_function_privilege('anon', p.oid, 'execute'))
  loop
    if fn.for_staff then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', fn.sig);
  end loop;
end;
$$;

revoke all on sequence public.subscription_invoice_number_seq from anon;
