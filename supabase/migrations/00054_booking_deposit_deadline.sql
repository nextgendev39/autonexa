-- A booking made without a deposit (amount = 0) is held for 3 days. If no deposit is
-- recorded by then, the booking is cancelled with a reason, the car goes back to
-- Ready for sale, and every active Super Admin gets a notification (shown as a
-- persistent alert in the app and delivered as a web push by the app).

alter table public.reservations
  add column if not exists auto_cancelled boolean not null default false;

comment on column public.reservations.auto_cancelled is
  'True when the system cancelled the booking because no deposit was received in time.';

-- Structured payload so the app can render notifications in the viewer's language,
-- and a marker for when the app delivered the web push for this notification.
alter table public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists pushed_at timestamptz;

comment on column public.notifications.data is 'Type-specific values used to render the notification.';
comment on column public.notifications.pushed_at is
  'When the app sent (or skipped) the web push for this notification. Null = not yet pushed.';

create index if not exists notifications_push_pending_idx
  on public.notifications (created_at)
  where pushed_at is null;

-- ---------------------------------------------------------------------------
-- Web push subscriptions (one row per browser/device). Managed by the app with the
-- service role after it authenticates the user, so clients get no direct access.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

comment on table public.push_subscriptions is
  'Browser web-push subscriptions. No client policies: read and written by the app with the service role.';

-- ---------------------------------------------------------------------------
-- Cancel bookings whose deposit never arrived.
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
begin
  perform set_config('app.vehicle_status_reason', 'booking_deposit_not_received', true);

  for v_row in
    select
      r.id,
      r.reservation_number,
      r.vehicle_id,
      r.salesperson_id,
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
      and r.reserved_at <= now() - interval '3 days'
    for update of r skip locked
  loop
    update public.reservations
    set status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'Deposit not received within 3 days',
        auto_cancelled = true
    where id = v_row.id;

    update public.vehicles
    set status = 'ready_for_sale'
    where id = v_row.vehicle_id
      and status = 'reserved';

    insert into public.notifications (user_id, type, title, message, entity_type, entity_id, data)
    select
      pr.id,
      'booking_auto_cancelled',
      'Booking cancelled: no deposit',
      format(
        'Booking %s (%s) was cancelled because no deposit was received within 3 days. The car is Ready for sale again.',
        v_row.reservation_number,
        coalesce(nullif(v_row.vehicle_title, ''), v_row.stock_number, 'vehicle')
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
        'reservedAt', v_row.reserved_at
      )
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

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.cancel_unpaid_bookings() is
  'Cancels active bookings with no deposit after 3 days, frees the car and notifies Super Admins.';

revoke all on function public.cancel_unpaid_bookings() from public, anon, authenticated;
grant execute on function public.cancel_unpaid_bookings() to service_role;

-- Hourly sweep when pg_cron is enabled (Database → Extensions). The app also runs
-- the sweep opportunistically and from /api/cron/booking-deposits, and sends the pushes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cancel-unpaid-bookings',
      '5 * * * *',
      'select public.cancel_unpaid_bookings()'
    );
  end if;
end;
$$;
