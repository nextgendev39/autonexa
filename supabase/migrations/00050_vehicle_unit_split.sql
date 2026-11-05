-- Multi-unit inventory: move some units of a record into their own record so they can
-- take a different status (book 2 of 5 → 3 Ready for sale + 2 Booked).
-- Called by the app with the service role after it has checked the caller's permissions.

alter table public.vehicles
  add column if not exists split_from_id uuid references public.vehicles (id) on delete set null;

comment on column public.vehicles.split_from_id is
  'Record these units were split from (see split_vehicle_units).';

create index if not exists vehicles_split_from_id_idx on public.vehicles (split_from_id);

-- Comma-separated, quoted column list for copying rows (skips generated columns).
create or replace function public.copyable_columns(p_table text, p_exclude text[])
returns text
language sql
stable
set search_path = public
as $$
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table
    and is_generated = 'NEVER'
    and column_name <> all (p_exclude);
$$;

/**
 * Moves p_quantity units of p_vehicle_id into a new record with the same details,
 * prices, photos and vehicle documents, and returns the new record's id.
 * VIN/chassis are not copied (they identify a single car and must stay unique).
 */
create or replace function public.split_vehicle_units(
  p_vehicle_id uuid,
  p_quantity integer,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
  v_new_id uuid;
  v_cols text;
begin
  select * into v_row
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity >= v_row.quantity then
    raise exception 'invalid split quantity';
  end if;

  -- Copied cost columns would otherwise trip vehicles_guard_cost_columns (no auth.uid()).
  perform set_config('app.bypass_vehicle_cost_guard', 'true', true);

  v_cols := public.copyable_columns('vehicles', array[
    'id', 'stock_number', 'quantity', 'vin', 'chassis_number', 'split_from_id',
    'created_by', 'updated_by', 'created_at', 'updated_at'
  ]);
  execute format(
    'insert into public.vehicles (%1$s, stock_number, quantity, split_from_id, created_by, updated_by)
     select %1$s, '''', $2, id, $3, $3 from public.vehicles where id = $1
     returning id',
    v_cols
  ) into v_new_id using p_vehicle_id, p_quantity, p_user_id;

  update public.vehicles
  set quantity = quantity - p_quantity,
      updated_by = coalesce(p_user_id, updated_by)
  where id = p_vehicle_id;

  v_cols := public.copyable_columns('vehicle_pricing', array['id', 'vehicle_id', 'created_at', 'updated_at']);
  execute format(
    'insert into public.vehicle_pricing (%1$s, vehicle_id)
     select %1$s, $2 from public.vehicle_pricing where vehicle_id = $1',
    v_cols
  ) using p_vehicle_id, v_new_id;

  -- Photos and documents point at the same storage objects; the app only deletes a
  -- storage object once no other row references it.
  v_cols := public.copyable_columns('vehicle_photos', array['id', 'vehicle_id', 'created_at', 'updated_at']);
  execute format(
    'insert into public.vehicle_photos (%1$s, vehicle_id)
     select %1$s, $2 from public.vehicle_photos where vehicle_id = $1',
    v_cols
  ) using p_vehicle_id, v_new_id;

  v_cols := public.copyable_columns('documents', array['id', 'entity_id', 'created_at', 'updated_at']);
  execute format(
    'insert into public.documents (%1$s, entity_id)
     select %1$s, $2 from public.documents
     where entity_type = ''vehicles'' and entity_id = $1 and deleted_at is null',
    v_cols
  ) using p_vehicle_id, v_new_id;

  return v_new_id;
end;
$$;

/** Reverts split_vehicle_units when the follow-up status change fails. */
create or replace function public.undo_vehicle_split(p_new_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
begin
  select * into v_row from public.vehicles where id = p_new_id and deleted_at is null for update;
  if not found or v_row.split_from_id is null then
    return;
  end if;

  update public.vehicles
  set quantity = quantity + v_row.quantity
  where id = v_row.split_from_id;

  update public.vehicles
  set deleted_at = timezone('utc', now())
  where id = p_new_id;
end;
$$;

revoke all on function public.copyable_columns(text, text[]) from public, authenticated;
revoke all on function public.split_vehicle_units(uuid, integer, uuid) from public, authenticated;
revoke all on function public.undo_vehicle_split(uuid) from public, authenticated;
grant execute on function public.copyable_columns(text, text[]) to service_role;
grant execute on function public.split_vehicle_units(uuid, integer, uuid) to service_role;
grant execute on function public.undo_vehicle_split(uuid) to service_role;
