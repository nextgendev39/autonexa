-- Phase 5: Inventory & Vehicle Management extensions.
-- Preserves existing vehicles schema; adds locations, identifiers, status transitions, stock numbers.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.drive_type as enum ('fwd', 'rwd', 'awd', 'four_wd', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mileage_unit as enum ('km', 'mi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.branch_location_type as enum (
    'showroom',
    'yard',
    'workshop',
    'storage',
    'delivery',
    'detailing',
    'other'
  );
exception when duplicate_object then null; end $$;

-- Extend vehicle_origin with unknown (GCC / Non-GCC / Unknown).
do $$ begin
  alter type public.vehicle_origin add value if not exists 'unknown';
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- Master data: makes / models (filter + autocomplete; vehicles keep text columns)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_makes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_makes_name_not_blank check (length(trim(name)) > 0),
  constraint vehicle_makes_name_unique unique (name)
);

create table if not exists public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references public.vehicle_makes (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_models_name_not_blank check (length(trim(name)) > 0),
  constraint vehicle_models_make_name_unique unique (make_id, name)
);

create index if not exists vehicle_models_make_id_idx on public.vehicle_models (make_id);

-- ---------------------------------------------------------------------------
-- Branch locations (showroom / yard / workshop / …)
-- ---------------------------------------------------------------------------

create table if not exists public.branch_locations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  location_type public.branch_location_type not null default 'other',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_locations_name_not_blank check (length(trim(name)) > 0),
  constraint branch_locations_branch_name_unique unique (branch_id, name)
);

create index if not exists branch_locations_branch_id_idx on public.branch_locations (branch_id);

create trigger branch_locations_set_updated_at
before update on public.branch_locations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vehicle column extensions
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists chassis_number text,
  add column if not exists drive_type public.drive_type,
  add column if not exists engine_cylinders integer,
  add column if not exists mileage_unit public.mileage_unit not null default 'km',
  add column if not exists location_id uuid references public.branch_locations (id) on delete set null,
  add column if not exists registration_date date,
  add column if not exists archived_at timestamptz,
  add column if not exists make_id uuid references public.vehicle_makes (id) on delete set null,
  add column if not exists model_id uuid references public.vehicle_models (id) on delete set null;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_engine_cylinders_positive
    check (engine_cylinders is null or engine_cylinders > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_chassis_not_blank
    check (chassis_number is null or length(trim(chassis_number)) > 0);
exception when duplicate_object then null; end $$;

create unique index if not exists vehicles_chassis_active_unique
  on public.vehicles (chassis_number)
  where deleted_at is null and chassis_number is not null;

create index if not exists vehicles_location_id_idx on public.vehicles (location_id);
create index if not exists vehicles_make_id_idx on public.vehicles (make_id);
create index if not exists vehicles_model_id_idx on public.vehicles (model_id);
create index if not exists vehicles_acquisition_date_idx on public.vehicles (purchase_date);
create index if not exists vehicles_updated_at_idx on public.vehicles (updated_at);
create index if not exists vehicles_chassis_trgm_idx on public.vehicles using gin (chassis_number extensions.gin_trgm_ops);

-- Location must belong to the vehicle's branch.
create or replace function public.enforce_vehicle_location_branch()
returns trigger
language plpgsql
as $$
declare
  loc_branch uuid;
begin
  if new.location_id is null then
    return new;
  end if;

  select branch_id into loc_branch
  from public.branch_locations
  where id = new.location_id and is_active = true;

  if loc_branch is null then
    raise exception 'invalid location';
  end if;

  if loc_branch is distinct from new.branch_id then
    raise exception 'location does not belong to vehicle branch';
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_enforce_location_branch on public.vehicles;
create trigger vehicles_enforce_location_branch
before insert or update of branch_id, location_id on public.vehicles
for each row execute function public.enforce_vehicle_location_branch();

-- ---------------------------------------------------------------------------
-- Stock number generation (ZM-000001) — race-safe sequence
-- ---------------------------------------------------------------------------

create sequence if not exists public.vehicle_stock_number_seq;

create or replace function public.next_vehicle_stock_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.vehicle_stock_number_seq');
  return 'ZM-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_vehicle_stock_number() from public;
grant execute on function public.next_vehicle_stock_number() to authenticated, service_role;

create or replace function public.vehicles_assign_stock_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_number is null or length(trim(new.stock_number)) = 0 then
    new.stock_number := public.next_vehicle_stock_number();
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_assign_stock_number on public.vehicles;
create trigger vehicles_assign_stock_number
before insert on public.vehicles
for each row execute function public.vehicles_assign_stock_number();

-- Align sequence with existing stock numbers like ZM-000123.
do $$
declare
  max_n bigint;
begin
  select coalesce(max(
    case
      when stock_number ~ '^ZM-[0-9]+$'
        then substring(stock_number from 4)::bigint
      else 0
    end
  ), 0)
  into max_n
  from public.vehicles;

  if max_n > 0 then
    perform setval('public.vehicle_stock_number_seq', max_n, true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Status transition rules
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_vehicle_status_transition(
  p_from public.vehicle_status,
  p_to public.vehicle_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from is null then true
    when p_from = p_to then true
    when p_from = 'acquired' and p_to = 'under_inspection' then true
    when p_from = 'under_inspection' and p_to in ('ready_for_sale', 'under_repair', 'inspection_failed') then true
    when p_from = 'inspection_failed' and p_to in ('under_repair', 'under_inspection', 'archived') then true
    when p_from = 'under_repair' and p_to in ('under_inspection', 'ready_for_sale') then true
    when p_from = 'ready_for_sale' and p_to in ('reserved', 'sold', 'under_repair') then true
    when p_from = 'reserved' and p_to in ('sold', 'ready_for_sale') then true
    when p_from = 'sold' and p_to = 'delivered' then true
    when p_from = 'delivered' and p_to = 'returned' then true
    when p_from = 'returned' and p_to in ('under_inspection', 'archived') then true
    when p_to = 'archived' and p_from not in ('sold', 'delivered', 'archived') then true
    else false
  end;
$$;

create or replace function public.enforce_vehicle_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and not public.is_valid_vehicle_status_transition(old.status, new.status) then
    raise exception 'invalid vehicle status transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'archived' and (old.status is distinct from 'archived' or old.archived_at is null) then
    new.archived_at := coalesce(new.archived_at, timezone('utc', now()));
  end if;

  if new.status is distinct from 'archived' then
    new.archived_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_enforce_status_transition on public.vehicles;
create trigger vehicles_enforce_status_transition
before update of status on public.vehicles
for each row execute function public.enforce_vehicle_status_transition();

-- Prefer app-provided reason for status history.
create or replace function public.track_vehicle_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  v_reason := nullif(current_setting('app.vehicle_status_reason', true), '');

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.vehicle_status_history (
      vehicle_id, old_status, new_status, reason, changed_by
    )
    values (
      new.id,
      old.status,
      new.status,
      coalesce(v_reason, 'status_change'),
      auth.uid()
    );
  elsif tg_op = 'INSERT' then
    insert into public.vehicle_status_history (
      vehicle_id, old_status, new_status, reason, changed_by
    )
    values (
      new.id,
      null,
      new.status,
      coalesce(v_reason, 'created'),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs for status change / transfer / archive
-- ---------------------------------------------------------------------------

create or replace function public.change_vehicle_status(
  p_vehicle_id uuid,
  p_new_status public.vehicle_status,
  p_reason text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
begin
  select * into v_row
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if not public.has_permission_for_branch('vehicle.status.change', v_row.branch_id)
     and not public.has_permission_for_branch('vehicle.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  perform set_config('app.vehicle_status_reason', trim(p_reason), true);

  update public.vehicles
  set
    status = p_new_status,
    updated_by = auth.uid()
  where id = p_vehicle_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.transfer_vehicle(
  p_vehicle_id uuid,
  p_branch_id uuid,
  p_location_id uuid default null,
  p_reason text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
  v_old_branch uuid;
begin
  select * into v_row
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  v_old_branch := v_row.branch_id;

  if not public.has_permission_for_branch('vehicle.branch.transfer', v_old_branch)
     and not public.has_permission_for_branch('vehicle.edit', v_old_branch) then
    raise exception 'not authorized';
  end if;

  if not public.has_permission_for_branch('vehicle.branch.transfer', p_branch_id)
     and not public.has_permission_for_branch('vehicle.edit', p_branch_id)
     and not public.can_access_branch(p_branch_id) then
    raise exception 'not authorized for target branch';
  end if;

  if v_row.status in ('sold', 'delivered', 'archived') then
    raise exception 'vehicle cannot be transferred in status %', v_row.status;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  update public.vehicles
  set
    branch_id = p_branch_id,
    location_id = p_location_id,
    updated_by = auth.uid()
  where id = p_vehicle_id
  returning * into v_row;

  perform public.write_audit_log(
    'VEHICLE_BRANCH_CHANGED',
    'vehicles',
    p_vehicle_id,
    jsonb_build_object('branch_id', v_old_branch, 'location_id', null),
    jsonb_build_object('branch_id', p_branch_id, 'location_id', p_location_id),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.archive_vehicle(
  p_vehicle_id uuid,
  p_reason text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
begin
  select * into v_row
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if not public.has_permission_for_branch('vehicle.archive', v_row.branch_id)
     and not public.has_permission_for_branch('vehicle.delete', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status in ('sold', 'delivered') then
    raise exception 'sold or delivered vehicles cannot be archived from active inventory workflow';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  perform set_config('app.vehicle_status_reason', trim(p_reason), true);

  update public.vehicles
  set
    status = 'archived',
    archived_at = timezone('utc', now()),
    updated_by = auth.uid()
  where id = p_vehicle_id
  returning * into v_row;

  perform public.write_audit_log(
    'VEHICLE_ARCHIVED',
    'vehicles',
    p_vehicle_id,
    null,
    jsonb_build_object('status', 'archived'),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

revoke all on function public.change_vehicle_status(uuid, public.vehicle_status, text) from public;
revoke all on function public.transfer_vehicle(uuid, uuid, uuid, text) from public;
revoke all on function public.archive_vehicle(uuid, text) from public;
grant execute on function public.change_vehicle_status(uuid, public.vehicle_status, text) to authenticated, service_role;
grant execute on function public.transfer_vehicle(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.archive_vehicle(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values
  ('vehicle.status.change', 'Change vehicle status', 'vehicle', 'Change vehicle lifecycle status with reason'),
  ('vehicle.branch.transfer', 'Transfer vehicle branch', 'vehicle', 'Move a vehicle between branches/locations'),
  ('vehicle.archive', 'Archive vehicle', 'vehicle', 'Archive a vehicle from active inventory')
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key in ('vehicle.status.change', 'vehicle.branch.transfer', 'vehicle.archive')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'vehicle.status.change', 'vehicle.branch.transfer', 'vehicle.archive'
)
where r.key in ('admin', 'general_manager', 'inventory_manager')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------

alter table public.vehicle_makes enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.branch_locations enable row level security;

drop policy if exists vehicle_makes_select on public.vehicle_makes;
create policy vehicle_makes_select on public.vehicle_makes
for select to authenticated
using (public.is_active_staff());

drop policy if exists vehicle_makes_manage on public.vehicle_makes;
create policy vehicle_makes_manage on public.vehicle_makes
for all to authenticated
using (public.has_permission('vehicle.edit') or public.is_super_admin())
with check (public.has_permission('vehicle.edit') or public.is_super_admin());

drop policy if exists vehicle_models_select on public.vehicle_models;
create policy vehicle_models_select on public.vehicle_models
for select to authenticated
using (public.is_active_staff());

drop policy if exists vehicle_models_manage on public.vehicle_models;
create policy vehicle_models_manage on public.vehicle_models
for all to authenticated
using (public.has_permission('vehicle.edit') or public.is_super_admin())
with check (public.has_permission('vehicle.edit') or public.is_super_admin());

drop policy if exists branch_locations_select on public.branch_locations;
create policy branch_locations_select on public.branch_locations
for select to authenticated
using (
  public.is_active_staff()
  and public.can_access_branch(branch_id)
);

drop policy if exists branch_locations_manage on public.branch_locations;
create policy branch_locations_manage on public.branch_locations
for all to authenticated
using (
  public.has_permission_for_branch('branch.manage', branch_id)
  or public.is_super_admin()
)
with check (
  public.has_permission_for_branch('branch.manage', branch_id)
  or public.is_super_admin()
);

comment on table public.branch_locations is
  'Physical locations within a branch (showroom, yard, workshop, storage).';
comment on function public.is_valid_vehicle_status_transition is
  'Central vehicle lifecycle transition map for Phase 5.';
comment on function public.change_vehicle_status is
  'Authorized status change with required reason and history.';
