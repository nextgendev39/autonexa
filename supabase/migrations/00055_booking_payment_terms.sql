-- Configurable booking payment terms, stored in minutes (edited as days + hours + minutes).
--   booking.deposit_minutes (default 3 days):  no deposit by then → booking cancelled (00054).
--   booking.balance_minutes (default 7 days):  full amount not received by then → the booking's
--                                              sales executive and every Super Admin are notified.
-- Both count from the booking's reserved_at and are edited in Settings.

insert into public.system_settings (key, value, description)
values
  ('booking.deposit_minutes', '4320'::jsonb,
   'Minutes after booking to receive a deposit. Unpaid bookings are cancelled after this.'),
  ('booking.balance_minutes', '10080'::jsonb,
   'Minutes after booking to receive the full amount. The sales executive and Super Admins are alerted after this.')
on conflict (key) do nothing;

alter table public.reservations
  add column if not exists balance_overdue_notified_at timestamptz;

comment on column public.reservations.balance_overdue_notified_at is
  'When the sales executive and Super Admins were alerted that the full amount was not received in time.';

-- Reads a deadline in minutes (1 minute to 365 days), falling back when missing or invalid.
create or replace function public.booking_term_minutes(p_key text, p_default integer)
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
    ),
    p_default
  );
$$;

revoke all on function public.booking_term_minutes(text, integer) from public, anon;
grant execute on function public.booking_term_minutes(text, integer) to authenticated, service_role;

-- "2 days 3 hours", "45 minutes": English text for stored messages and cancel reasons.
create or replace function public.format_minutes(p_minutes integer)
returns text
language sql
immutable
as $$
  select coalesce(nullif(concat_ws(' ',
    case when p_minutes / 1440 > 0 then (p_minutes / 1440) || case when p_minutes / 1440 = 1 then ' day' else ' days' end end,
    case when p_minutes % 1440 / 60 > 0 then (p_minutes % 1440 / 60) || case when p_minutes % 1440 / 60 = 1 then ' hour' else ' hours' end end,
    case when p_minutes % 60 > 0 then (p_minutes % 60) || case when p_minutes % 60 = 1 then ' minute' else ' minutes' end end
  ), ''), '0 minutes');
$$;

-- Super Admins who should receive booking alerts.
create or replace function public.active_super_admin_ids()
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
    and exists (
      select 1
      from public.user_roles ur
      join public.roles ro on ro.id = ur.role_id
      where ur.user_id = pr.id
        and ro.key = 'super_admin'
    );
$$;

revoke all on function public.active_super_admin_ids() from public, anon, authenticated;
grant execute on function public.active_super_admin_ids() to service_role;

-- ---------------------------------------------------------------------------
-- Deposit deadline now follows booking.deposit_minutes.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_unpaid_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_minutes integer := public.booking_term_minutes('booking.deposit_minutes', 4320);
  v_reason text := format('Deposit not received within %s', public.format_minutes(v_minutes));
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

    insert into public.notifications (user_id, type, title, message, entity_type, entity_id, data)
    select
      admin_id,
      'booking_auto_cancelled',
      'Booking cancelled: no deposit',
      format(
        'Booking %s (%s) was cancelled because no deposit was received within %s. The car is Ready for sale again.',
        v_row.reservation_number,
        coalesce(nullif(v_row.vehicle_title, ''), v_row.stock_number, 'vehicle'),
        public.format_minutes(v_minutes)
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
        'deadlineMinutes', v_minutes
      )
    from public.active_super_admin_ids() as admin_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Balance deadline: alert once when the full amount is still outstanding.
-- ---------------------------------------------------------------------------
create or replace function public.notify_overdue_balances()
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
$$;

comment on function public.notify_overdue_balances() is
  'Alerts the sales executive and Super Admins once per booking when the full amount is overdue.';

revoke all on function public.notify_overdue_balances() from public, anon, authenticated;
grant execute on function public.notify_overdue_balances() to service_role;

-- Deadlines can be minutes long now, so both jobs run every 5 minutes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cancel-unpaid-bookings',
      '*/5 * * * *',
      'select public.cancel_unpaid_bookings()'
    );
    perform cron.schedule(
      'notify-overdue-balances',
      '*/5 * * * *',
      'select public.notify_overdue_balances()'
    );
  end if;
end;
$$;
