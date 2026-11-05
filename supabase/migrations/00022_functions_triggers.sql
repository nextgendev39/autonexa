-- Audit helpers, vehicle status/price history capture, and reservation integrity helpers.

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_id uuid;
  action_name text;
begin
  action_name := lower(tg_op);
  if tg_op = 'DELETE' then
    entity_id := old.id;
    perform public.write_audit_log(
      action_name,
      tg_table_name,
      entity_id,
      to_jsonb(old),
      null,
      jsonb_build_object('schema', tg_table_schema)
    );
    return old;
  elsif tg_op = 'UPDATE' then
    entity_id := new.id;
    perform public.write_audit_log(
      action_name,
      tg_table_name,
      entity_id,
      to_jsonb(old),
      to_jsonb(new),
      jsonb_build_object('schema', tg_table_schema)
    );
    return new;
  else
    entity_id := new.id;
    perform public.write_audit_log(
      action_name,
      tg_table_name,
      entity_id,
      null,
      to_jsonb(new),
      jsonb_build_object('schema', tg_table_schema)
    );
    return new;
  end if;
end;
$$;

-- Audited entities (selective): vehicles, acquisitions, inspections, reservations,
-- sales, payments, profiles, roles, user_roles. Skip noisy history/photo tables.
create trigger vehicles_audit
after insert or update or delete on public.vehicles
for each row execute function public.audit_row_change();

create trigger acquisitions_audit
after insert or update or delete on public.acquisitions
for each row execute function public.audit_row_change();

create trigger inspections_audit
after insert or update or delete on public.inspections
for each row execute function public.audit_row_change();

create trigger reservations_audit
after insert or update or delete on public.reservations
for each row execute function public.audit_row_change();

create trigger sales_audit
after insert or update or delete on public.sales
for each row execute function public.audit_row_change();

create trigger payments_audit
after insert or update or delete on public.payments
for each row execute function public.audit_row_change();

create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function public.audit_row_change();

create trigger roles_audit
after insert or update or delete on public.roles
for each row execute function public.audit_row_change();

create trigger user_roles_audit
after insert or update or delete on public.user_roles
for each row execute function public.audit_row_change();

-- Capture vehicle status transitions automatically.
create or replace function public.track_vehicle_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.vehicle_status_history (
      vehicle_id,
      old_status,
      new_status,
      reason,
      changed_by
    )
    values (
      new.id,
      old.status,
      new.status,
      'status_change',
      auth.uid()
    );
  elsif tg_op = 'INSERT' then
    insert into public.vehicle_status_history (
      vehicle_id,
      old_status,
      new_status,
      reason,
      changed_by
    )
    values (
      new.id,
      null,
      new.status,
      'created',
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger vehicles_track_status
after insert or update of status on public.vehicles
for each row execute function public.track_vehicle_status_change();

-- Capture selling price changes automatically.
create or replace function public.track_vehicle_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.current_selling_price is distinct from old.current_selling_price
     and new.current_selling_price is not null then
    insert into public.vehicle_price_history (
      vehicle_id,
      old_price,
      new_price,
      reason,
      changed_by
    )
    values (
      new.id,
      old.current_selling_price,
      new.current_selling_price,
      'price_update',
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger vehicles_track_price
after update of current_selling_price on public.vehicles
for each row execute function public.track_vehicle_price_change();

-- Reject ACTIVE reservation when vehicle is already sold/delivered/archived.
create or replace function public.enforce_reservation_vehicle_state()
returns trigger
language plpgsql
as $$
declare
  current_status public.vehicle_status;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select status into current_status
  from public.vehicles
  where id = new.vehicle_id
    and deleted_at is null;

  if current_status is null then
    raise exception 'Vehicle % is missing or deleted', new.vehicle_id;
  end if;

  if current_status in ('sold', 'delivered', 'archived') then
    raise exception
      'Cannot create an active reservation for vehicle % in status %',
      new.vehicle_id,
      current_status;
  end if;

  return new;
end;
$$;

create trigger reservations_enforce_vehicle_state
before insert or update of status, vehicle_id on public.reservations
for each row execute function public.enforce_reservation_vehicle_state();

comment on function public.write_audit_log is
  'Inserts an audit_logs row. Used by selective entity triggers.';
comment on function public.track_vehicle_status_change is
  'Writes vehicle_status_history whenever vehicles.status changes.';
comment on function public.enforce_reservation_vehicle_state is
  'Blocks ACTIVE reservations against sold/delivered/archived vehicles.';
