-- SaaS Phase 2: close the paths RLS cannot reach. Definer functions and service-role code bypass
-- policies, so each is bound here. Changes no existing row.
-- Rollback: supabase/rollbacks/00075_tenant_definer_hardening_down.sql

-- ---------------------------------------------------------------------------
-- Nothing is callable without logging in. Supabase grants new functions to anon, and the public
-- key is in every browser: forged audit rows and unit splits worked with no session. Sign-in,
-- password reset and the share page all run on the server with the service role, and every
-- policy names `authenticated`, so anon needs none of these.
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig, has_function_privilege('authenticated', p.oid, 'execute') as for_staff
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    -- Staff may be relying on the PUBLIC grant removed below, so make theirs explicit first.
    if fn.for_staff then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    execute format('grant execute on function %s to service_role', fn.sig);
    execute format('revoke execute on function %s from public, anon', fn.sig);
  end loop;
end;
$$;

alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- Audit log: a logged-in caller's dealership is the only one they can write to, even with no
-- active dealership. The payload names the tenant only for privileged server code.
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
    case
      when auth.uid() is not null then public.current_tenant_id()
      else coalesce(
        (p_new_values ->> 'tenant_id')::uuid,
        (p_old_values ->> 'tenant_id')::uuid,
        public.resolve_insert_tenant_id()
      )
    end,
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
-- Cost and lineage helpers answered for any branch in the dealership
-- ---------------------------------------------------------------------------

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
    and (auth.uid() is null or exists (
      select 1 from public.acquisitions a
      where a.id = e.acquisition_id and public.can_access_branch(a.branch_id)
    ));
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
      (select a.purchase_price from public.acquisitions a where a.id = p_acquisition_id and (auth.uid() is null or public.can_access_branch(a.branch_id))),
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
    and (auth.uid() is null or exists (
      select 1 from public.vehicles v
      where v.id = e.vehicle_id and public.can_access_branch(v.branch_id)
    ));
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
      and (auth.uid() is null or public.can_access_branch(v.branch_id))
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
-- Records that point at files or other records by bare ID. Service-role code later signs and
-- deletes these paths, so a row naming another dealership's file would reach it.
-- ---------------------------------------------------------------------------

-- The dealership owning an ID, looked up in every table a path or document can start from.
create function public.tenant_of_record(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.vehicles where id = p_id
  union all select tenant_id from public.customers where id = p_id
  union all select tenant_id from public.sales where id = p_id
  union all select tenant_id from public.acquisitions where id = p_id
  union all select tenant_id from public.reservations where id = p_id
  union all select tenant_id from public.vehicle_pricing where id = p_id
  limit 1;
$$;

revoke all on function public.tenant_of_record(uuid) from public, anon, authenticated;

create function public.guard_record_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity uuid := public.storage_entity_id(new.storage_path);
  v_owner uuid;
begin
  -- Every object path starts with the ID of the record it belongs to.
  if v_entity is null or '/' || new.storage_path || '/' like '%/../%' then
    raise exception 'invalid storage path on %', tg_table_name using errcode = '23514';
  end if;

  v_owner := public.tenant_of_record(v_entity);
  if v_owner is not null and v_owner <> new.tenant_id then
    raise exception 'tenant mismatch on %: the file belongs to a different dealership', tg_table_name
      using errcode = '23503';
  end if;

  if tg_table_name = 'documents' then
    v_owner := public.tenant_of_record(new.entity_id);
    if v_owner is not null and v_owner <> new.tenant_id then
      raise exception 'tenant mismatch on documents: the record belongs to a different dealership'
        using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_record_links() from public, anon, authenticated;

-- Named a1_ so it runs after a0_tenant_from_parent has settled tenant_id.
create trigger a1_guard_record_links before insert or update of storage_path on public.vehicle_photos
  for each row execute function public.guard_record_links();
create trigger a1_guard_record_links before insert or update of storage_path, entity_id on public.documents
  for each row execute function public.guard_record_links();

-- ---------------------------------------------------------------------------
-- Storage: the same restrictive rule as tables. A path must resolve to a record in the caller's
-- dealership. Objects stay where they are. A bucket added later is closed until it has a rule.
-- ---------------------------------------------------------------------------

create function public.storage_object_in_current_tenant(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_of_record(public.storage_entity_id(object_name)) = public.current_tenant_id();
$$;

revoke all on function public.storage_object_in_current_tenant(text) from public, anon;
grant execute on function public.storage_object_in_current_tenant(text) to authenticated;

create policy storage_tenant_isolation on storage.objects as restrictive for all to authenticated
  using (public.storage_object_in_current_tenant(name))
  with check (public.storage_object_in_current_tenant(name));

-- ---------------------------------------------------------------------------
-- Sweeps can run for one dealership, so "Run checks now" touches and reports only its own
-- bookings. The scheduled no-argument forms still cover every dealership.
-- ---------------------------------------------------------------------------

create function public.cancel_unpaid_bookings(p_tenant_id uuid)
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

create function public.notify_overdue_balances(p_tenant_id uuid)
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

revoke all on function public.cancel_unpaid_bookings(uuid) from public, anon, authenticated;
revoke all on function public.notify_overdue_balances(uuid) from public, anon, authenticated;
grant execute on function public.cancel_unpaid_bookings(uuid) to service_role;
grant execute on function public.notify_overdue_balances(uuid) to service_role;

create or replace function public.cancel_unpaid_bookings()
returns integer
language sql
security definer
set search_path = public
as $$
  select public.cancel_unpaid_bookings(null::uuid);
$$;

create or replace function public.notify_overdue_balances()
returns integer
language sql
security definer
set search_path = public
as $$
  select public.notify_overdue_balances(null::uuid);
$$;
