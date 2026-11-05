-- Booking deposit exception: when no deposit has arrived, the sales executive can ask a
-- Super Admin to hold the booking instead of letting it auto-cancel.
--   pending   request sent; auto-cancellation waits for the decision
--   approved  booking stays active; auto-cancellation is off for it
--   rejected  the normal deposit deadline applies again (cancels at once if it passed)
-- One request per booking: the status only moves null → pending → approved/rejected,
-- enforced by conditional updates in the app (service role).

alter table public.reservations
  add column if not exists cancellation_hold_status text,
  add column if not exists cancellation_hold_reason text,
  add column if not exists cancellation_hold_requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancellation_hold_requested_at timestamptz,
  add column if not exists cancellation_hold_reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancellation_hold_reviewed_at timestamptz,
  add column if not exists cancellation_hold_review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_cancellation_hold_status_check'
  ) then
    alter table public.reservations
      add constraint reservations_cancellation_hold_status_check
      check (cancellation_hold_status is null or cancellation_hold_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

comment on column public.reservations.cancellation_hold_status is
  'Deposit exception request: null (none), pending, approved (no auto-cancel) or rejected (normal deadline).';

-- Signed-in users may update their own bookings under RLS, so without this a sales executive
-- could approve their own hold through the Data API. Only the server (service role, where
-- auth.uid() is null) may change these columns, after it has checked who is asking.
create or replace function public.reservations_guard_cancellation_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.cancellation_hold_status is distinct from old.cancellation_hold_status
     or new.cancellation_hold_reason is distinct from old.cancellation_hold_reason
     or new.cancellation_hold_requested_by is distinct from old.cancellation_hold_requested_by
     or new.cancellation_hold_requested_at is distinct from old.cancellation_hold_requested_at
     or new.cancellation_hold_reviewed_by is distinct from old.cancellation_hold_reviewed_by
     or new.cancellation_hold_reviewed_at is distinct from old.cancellation_hold_reviewed_at
     or new.cancellation_hold_review_note is distinct from old.cancellation_hold_review_note then
    raise exception 'not authorized to change the cancellation hold';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_guard_cancellation_hold on public.reservations;
create trigger reservations_guard_cancellation_hold
before update on public.reservations
for each row execute function public.reservations_guard_cancellation_hold();

create or replace function public.reservations_guard_cancellation_hold_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and (
    new.cancellation_hold_status is not null
    or new.cancellation_hold_reviewed_by is not null
    or new.cancellation_hold_reviewed_at is not null
  ) then
    raise exception 'not authorized to set the cancellation hold';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_guard_cancellation_hold_insert on public.reservations;
create trigger reservations_guard_cancellation_hold_insert
before insert on public.reservations
for each row execute function public.reservations_guard_cancellation_hold_insert();

-- Same sweep as 00058, skipping bookings with a pending or approved cancellation hold.
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
$$;
