-- Multi-unit inventory: booking some units splits them into their own record (00050).
-- When that booking is cancelled the units go back to Ready for sale and are merged into
-- the Ready for sale record they were split from, instead of staying a separate record
-- (book 3 of 5 → 2 Ready + 3 Booked; cancel → 5 Ready on one record again).

alter table public.reservations
  add column if not exists units integer;

alter table public.reservations
  drop constraint if exists reservations_units_positive;
alter table public.reservations
  add constraint reservations_units_positive check (units is null or units > 0);

comment on column public.reservations.units is
  'Units the booking held, kept when its vehicle record is merged back into another one. Null: the vehicle''s quantity.';

/**
 * Merges every Ready for sale record of p_vehicle_id's split family (records sharing the
 * same root, see vehicle_root_id) into the oldest one. Merged records are soft-deleted and
 * their bookings and leads point at the remaining record. Returns that record's id.
 * Prices, photos and documents of the remaining record are kept.
 */
create or replace function public.merge_ready_split_units(p_vehicle_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root uuid := public.vehicle_root_id(p_vehicle_id);
  v_keep public.vehicles%rowtype;
  v_row record;
begin
  -- Same branch only: units in another branch stay their own record.
  select v.* into v_keep
  from public.vehicles v
  where v.deleted_at is null
    and v.status = 'ready_for_sale'
    and public.vehicle_root_id(v.id) = v_root
    and v.branch_id = (select branch_id from public.vehicles where id = p_vehicle_id)
  order by v.created_at, v.id
  limit 1
  for update;

  if not found then
    return p_vehicle_id;
  end if;

  for v_row in
    select v.id, v.quantity
    from public.vehicles v
    where v.deleted_at is null
      and v.status = 'ready_for_sale'
      and v.id <> v_keep.id
      and v.branch_id = v_keep.branch_id
      and public.vehicle_root_id(v.id) = v_root
    for update
  loop
    -- Bookings on the merged record keep their unit count and follow the units.
    update public.reservations
    set units = coalesce(units, v_row.quantity),
        vehicle_id = v_keep.id
    where vehicle_id = v_row.id;

    update public.leads set vehicle_id = v_keep.id where vehicle_id = v_row.id;

    -- Records split from the merged one now count it as their source.
    update public.vehicles set split_from_id = v_keep.id where split_from_id = v_row.id and id <> v_keep.id;

    update public.vehicles
    set quantity = quantity + v_row.quantity
    where id = v_keep.id;

    update public.vehicles
    set deleted_at = timezone('utc', now())
    where id = v_row.id;
  end loop;

  return v_keep.id;
end;
$$;

revoke all on function public.merge_ready_split_units(uuid) from public, anon, authenticated;
grant execute on function public.merge_ready_split_units(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Same as 00056, merging the units back after an automatic cancellation.
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
