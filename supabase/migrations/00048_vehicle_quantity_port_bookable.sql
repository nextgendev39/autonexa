-- Inventory: quantity, port location for In transit cars, and a bookable flag
-- derived from the (column-restricted) minimum selling price.

alter table public.vehicles
  add column if not exists quantity integer not null default 1,
  add column if not exists port_location text,
  -- Exposes only whether a minimum price exists, so roles without cost/price access
  -- can tell a car is bookable without reading minimum_selling_price itself.
  add column if not exists has_minimum_price boolean
    generated always as (coalesce(minimum_selling_price, 0) > 0) stored;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_quantity_positive check (quantity > 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_port_location_not_blank
    check (port_location is null or length(trim(port_location)) > 0);
exception when duplicate_object then null;
end $$;

comment on column public.vehicles.quantity is 'Number of units this inventory record represents.';
comment on column public.vehicles.port_location is 'Arrival port; required by the app while status = acquired (In transit).';
comment on column public.vehicles.has_minimum_price is 'True when minimum_selling_price > 0. Bookings require it.';

-- Bookings may only be created for cars with a minimum selling price.
create or replace function public.reservations_require_minimum_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.vehicles
    where id = new.vehicle_id and has_minimum_price
  ) then
    raise exception 'minimum selling price not set';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_require_minimum_price on public.reservations;
create trigger reservations_require_minimum_price
before insert on public.reservations
for each row execute function public.reservations_require_minimum_price();
