-- Vehicle master catalog (UAE-focused).
-- Extends existing vehicle_makes / vehicle_models; adds model years + variants.
-- Catalog is master data — independent from inventory vehicle rows.

-- ---------------------------------------------------------------------------
-- Enums: reuse existing fuel_type / transmission_type / drive_type.
-- Catalog vehicle_type is free text with a check constraint (app-level constants).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- vehicle_makes (brands) — extend in place
-- ---------------------------------------------------------------------------

alter table public.vehicle_makes
  add column if not exists name_ar text,
  add column if not exists slug text,
  add column if not exists country text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.catalog_slugify(value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from lower(regexp_replace(coalesce(value, ''), '[^a-zA-Z0-9]+', '-', 'g'))),
    ''
  );
$$;

create or replace function public.vehicle_makes_set_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.catalog_slugify(new.name);
  end if;
  if new.slug is null then
    raise exception 'vehicle_makes.slug could not be derived from name';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_makes_set_slug on public.vehicle_makes;
create trigger vehicle_makes_set_slug
before insert or update of name, slug on public.vehicle_makes
for each row execute function public.vehicle_makes_set_slug();

update public.vehicle_makes
set slug = public.catalog_slugify(name)
where slug is null or btrim(slug) = '';

-- Ensure uniqueness if collisions after slugify
update public.vehicle_makes m
set slug = m.slug || '-' || substr(replace(m.id::text, '-', ''), 1, 6)
where exists (
  select 1 from public.vehicle_makes o
  where o.slug = m.slug and o.id < m.id
);

alter table public.vehicle_makes
  alter column slug set not null;

do $$ begin
  alter table public.vehicle_makes
    add constraint vehicle_makes_slug_unique unique (slug);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicle_makes
    add constraint vehicle_makes_slug_not_blank check (length(trim(slug)) > 0);
exception when duplicate_object then null; end $$;

drop trigger if exists vehicle_makes_set_updated_at on public.vehicle_makes;
create trigger vehicle_makes_set_updated_at
before update on public.vehicle_makes
for each row execute function public.set_updated_at();

comment on table public.vehicle_makes is
  'Master vehicle brands (makes). Seeded for UAE market; not inventory.';

-- ---------------------------------------------------------------------------
-- vehicle_models — extend in place
-- ---------------------------------------------------------------------------

alter table public.vehicle_models
  add column if not exists name_ar text,
  add column if not exists slug text,
  add column if not exists vehicle_type text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.vehicle_models_set_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.catalog_slugify(new.name);
  end if;
  if new.slug is null then
    raise exception 'vehicle_models.slug could not be derived from name';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_models_set_slug on public.vehicle_models;
create trigger vehicle_models_set_slug
before insert or update of name, slug on public.vehicle_models
for each row execute function public.vehicle_models_set_slug();

update public.vehicle_models
set slug = public.catalog_slugify(name)
where slug is null or btrim(slug) = '';

update public.vehicle_models m
set slug = m.slug || '-' || substr(replace(m.id::text, '-', ''), 1, 6)
where exists (
  select 1 from public.vehicle_models o
  where o.make_id = m.make_id and o.slug = m.slug and o.id < m.id
);

alter table public.vehicle_models
  alter column slug set not null;

do $$ begin
  alter table public.vehicle_models
    add constraint vehicle_models_make_slug_unique unique (make_id, slug);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicle_models
    add constraint vehicle_models_slug_not_blank check (length(trim(slug)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicle_models
    add constraint vehicle_models_vehicle_type_check check (
      vehicle_type is null
      or vehicle_type in (
        'SEDAN', 'SUV', 'COUPE', 'CONVERTIBLE', 'HATCHBACK', 'WAGON',
        'PICKUP', 'VAN', 'MPV', 'MINIVAN', 'COMMERCIAL', 'SPORTS_CAR',
        'ELECTRIC', 'OTHER'
      )
    );
exception when duplicate_object then null; end $$;

drop trigger if exists vehicle_models_set_updated_at on public.vehicle_models;
create trigger vehicle_models_set_updated_at
before update on public.vehicle_models
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vehicle_model_years
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_model_years (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_models (id) on delete restrict,
  year integer not null,
  market text not null default 'UAE',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_model_years_year_range check (year >= 1980 and year <= 2100),
  constraint vehicle_model_years_market_not_blank check (length(trim(market)) > 0),
  constraint vehicle_model_years_model_year_market_unique unique (model_id, year, market)
);

create index if not exists vehicle_model_years_model_id_idx
  on public.vehicle_model_years (model_id);

create index if not exists vehicle_model_years_active_idx
  on public.vehicle_model_years (model_id, year)
  where is_active;

drop trigger if exists vehicle_model_years_set_updated_at on public.vehicle_model_years;
create trigger vehicle_model_years_set_updated_at
before update on public.vehicle_model_years
for each row execute function public.set_updated_at();

comment on table public.vehicle_model_years is
  'Catalog model-year rows scoped by market (default UAE).';

-- ---------------------------------------------------------------------------
-- vehicle_variants
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_variants (
  id uuid primary key default gen_random_uuid(),
  model_year_id uuid not null references public.vehicle_model_years (id) on delete restrict,
  name text not null,
  name_ar text,
  slug text not null,
  trim_code text,
  engine text,
  engine_capacity numeric,
  fuel_type public.fuel_type,
  transmission public.transmission_type,
  drivetrain public.drive_type,
  body_type text,
  seating_capacity integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_variants_name_not_blank check (length(trim(name)) > 0),
  constraint vehicle_variants_slug_not_blank check (length(trim(slug)) > 0),
  constraint vehicle_variants_model_year_slug_unique unique (model_year_id, slug),
  constraint vehicle_variants_seating_positive check (
    seating_capacity is null or seating_capacity > 0
  ),
  constraint vehicle_variants_engine_capacity_positive check (
    engine_capacity is null or engine_capacity > 0
  )
);

create index if not exists vehicle_variants_model_year_id_idx
  on public.vehicle_variants (model_year_id);

create index if not exists vehicle_variants_active_idx
  on public.vehicle_variants (model_year_id, sort_order, name)
  where is_active;

drop trigger if exists vehicle_variants_set_updated_at on public.vehicle_variants;
create trigger vehicle_variants_set_updated_at
before update on public.vehicle_variants
for each row execute function public.set_updated_at();

comment on table public.vehicle_variants is
  'Catalog trim/variant rows for a model year + market. Prefer verified UAE trims only.';

-- ---------------------------------------------------------------------------
-- vehicles — link to catalog (keep text snapshot columns)
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists model_year_id uuid references public.vehicle_model_years (id) on delete set null,
  add column if not exists variant_id uuid references public.vehicle_variants (id) on delete set null,
  add column if not exists custom_variant text;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_custom_variant_not_blank check (
      custom_variant is null or length(trim(custom_variant)) > 0
    );
exception when duplicate_object then null; end $$;

create index if not exists vehicles_model_year_id_idx on public.vehicles (model_year_id);
create index if not exists vehicles_variant_id_idx on public.vehicles (variant_id);

-- ---------------------------------------------------------------------------
-- Consistency: catalog FKs must form a valid hierarchy
-- ---------------------------------------------------------------------------

create or replace function public.validate_vehicle_catalog_links()
returns trigger
language plpgsql
as $$
declare
  v_model_make_id uuid;
  v_year_model_id uuid;
  v_year_year integer;
  v_variant_year_id uuid;
begin
  if new.model_id is not null then
    select make_id into v_model_make_id
    from public.vehicle_models
    where id = new.model_id;

    if v_model_make_id is null then
      raise exception 'Invalid model_id';
    end if;

    if new.make_id is not null and new.make_id is distinct from v_model_make_id then
      raise exception 'model_id does not belong to make_id';
    end if;

    if new.make_id is null then
      new.make_id := v_model_make_id;
    end if;
  end if;

  if new.model_year_id is not null then
    select model_id, year into v_year_model_id, v_year_year
    from public.vehicle_model_years
    where id = new.model_year_id;

    if v_year_model_id is null then
      raise exception 'Invalid model_year_id';
    end if;

    if new.model_id is not null and new.model_id is distinct from v_year_model_id then
      raise exception 'model_year_id does not belong to model_id';
    end if;

    if new.model_id is null then
      new.model_id := v_year_model_id;
    end if;

    if new.year is distinct from v_year_year then
      new.year := v_year_year;
    end if;
  end if;

  if new.variant_id is not null then
    select model_year_id into v_variant_year_id
    from public.vehicle_variants
    where id = new.variant_id;

    if v_variant_year_id is null then
      raise exception 'Invalid variant_id';
    end if;

    if new.model_year_id is not null and new.model_year_id is distinct from v_variant_year_id then
      raise exception 'variant_id does not belong to model_year_id';
    end if;

    if new.model_year_id is null then
      new.model_year_id := v_variant_year_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_validate_catalog_links on public.vehicles;
create trigger vehicles_validate_catalog_links
before insert or update of make_id, model_id, model_year_id, variant_id, year
on public.vehicles
for each row execute function public.validate_vehicle_catalog_links();

-- ---------------------------------------------------------------------------
-- Prevent hard-delete of catalog rows referenced by inventory
-- ---------------------------------------------------------------------------

create or replace function public.prevent_referenced_catalog_delete()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'vehicle_makes' then
    if exists (select 1 from public.vehicles v where v.make_id = old.id and v.deleted_at is null) then
      raise exception 'Cannot delete brand referenced by inventory; deactivate instead';
    end if;
  elsif tg_table_name = 'vehicle_models' then
    if exists (select 1 from public.vehicles v where v.model_id = old.id and v.deleted_at is null) then
      raise exception 'Cannot delete model referenced by inventory; deactivate instead';
    end if;
  elsif tg_table_name = 'vehicle_model_years' then
    if exists (select 1 from public.vehicles v where v.model_year_id = old.id and v.deleted_at is null) then
      raise exception 'Cannot delete model year referenced by inventory; deactivate instead';
    end if;
  elsif tg_table_name = 'vehicle_variants' then
    if exists (select 1 from public.vehicles v where v.variant_id = old.id and v.deleted_at is null) then
      raise exception 'Cannot delete variant referenced by inventory; deactivate instead';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists vehicle_makes_prevent_referenced_delete on public.vehicle_makes;
create trigger vehicle_makes_prevent_referenced_delete
before delete on public.vehicle_makes
for each row execute function public.prevent_referenced_catalog_delete();

drop trigger if exists vehicle_models_prevent_referenced_delete on public.vehicle_models;
create trigger vehicle_models_prevent_referenced_delete
before delete on public.vehicle_models
for each row execute function public.prevent_referenced_catalog_delete();

drop trigger if exists vehicle_model_years_prevent_referenced_delete on public.vehicle_model_years;
create trigger vehicle_model_years_prevent_referenced_delete
before delete on public.vehicle_model_years
for each row execute function public.prevent_referenced_catalog_delete();

drop trigger if exists vehicle_variants_prevent_referenced_delete on public.vehicle_variants;
create trigger vehicle_variants_prevent_referenced_delete
before delete on public.vehicle_variants
for each row execute function public.prevent_referenced_catalog_delete();

-- ---------------------------------------------------------------------------
-- Safe mapping of existing text make/model → catalog ids (no data loss)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_catalog_mapping_unmatched (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  stock_number text,
  make_text text,
  model_text text,
  variant_text text,
  year integer,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_catalog_mapping_unmatched_vehicle_unique unique (vehicle_id)
);

comment on table public.vehicle_catalog_mapping_unmatched is
  'Inventory rows that could not be auto-linked to the master catalog.';

create or replace function public.map_vehicles_to_catalog()
returns table (
  linked_make integer,
  linked_model integer,
  unmatched integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_make integer := 0;
  v_linked_model integer := 0;
  v_unmatched integer := 0;
  r record;
  v_make_id uuid;
  v_model_id uuid;
begin
  truncate public.vehicle_catalog_mapping_unmatched;

  for r in
    select id, stock_number, make, model, variant, year, make_id, model_id
    from public.vehicles
    where deleted_at is null
  loop
    v_make_id := r.make_id;
    v_model_id := r.model_id;

    if v_make_id is null and r.make is not null and btrim(r.make) <> '' then
      select id into v_make_id
      from public.vehicle_makes
      where lower(name) = lower(btrim(r.make))
      limit 1;

      if v_make_id is not null then
        update public.vehicles set make_id = v_make_id where id = r.id;
        v_linked_make := v_linked_make + 1;
      end if;
    end if;

    if v_model_id is null and v_make_id is not null and r.model is not null and btrim(r.model) <> '' then
      select id into v_model_id
      from public.vehicle_models
      where make_id = v_make_id
        and lower(name) = lower(btrim(r.model))
      limit 1;

      if v_model_id is not null then
        update public.vehicles set model_id = v_model_id where id = r.id;
        v_linked_model := v_linked_model + 1;
      end if;
    end if;

    if v_make_id is null or (r.model is not null and btrim(r.model) <> '' and v_model_id is null) then
      insert into public.vehicle_catalog_mapping_unmatched (
        vehicle_id, stock_number, make_text, model_text, variant_text, year, reason
      ) values (
        r.id,
        r.stock_number,
        r.make,
        r.model,
        r.variant,
        r.year,
        case
          when v_make_id is null then 'unmatched_make'
          else 'unmatched_model'
        end
      )
      on conflict (vehicle_id) do update set
        make_text = excluded.make_text,
        model_text = excluded.model_text,
        variant_text = excluded.variant_text,
        year = excluded.year,
        reason = excluded.reason;

      v_unmatched := v_unmatched + 1;
    end if;
  end loop;

  linked_make := v_linked_make;
  linked_model := v_linked_model;
  unmatched := v_unmatched;
  return next;
end;
$$;

revoke all on function public.map_vehicles_to_catalog() from public;
grant execute on function public.map_vehicles_to_catalog() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.vehicle_model_years enable row level security;
alter table public.vehicle_variants enable row level security;
alter table public.vehicle_catalog_mapping_unmatched enable row level security;

-- Read: active staff (inventory selectors + admin)
drop policy if exists vehicle_makes_select on public.vehicle_makes;
create policy vehicle_makes_select on public.vehicle_makes
for select to authenticated
using (public.is_active_staff());

drop policy if exists vehicle_models_select on public.vehicle_models;
create policy vehicle_models_select on public.vehicle_models
for select to authenticated
using (public.is_active_staff());

drop policy if exists vehicle_model_years_select on public.vehicle_model_years;
create policy vehicle_model_years_select on public.vehicle_model_years
for select to authenticated
using (public.is_active_staff());

drop policy if exists vehicle_variants_select on public.vehicle_variants;
create policy vehicle_variants_select on public.vehicle_variants
for select to authenticated
using (public.is_active_staff());

-- Write: master-data / settings admins only (not ordinary sales)
drop policy if exists vehicle_makes_manage on public.vehicle_makes;
create policy vehicle_makes_manage on public.vehicle_makes
for all to authenticated
using (public.has_permission('settings.manage') or public.is_super_admin())
with check (public.has_permission('settings.manage') or public.is_super_admin());

drop policy if exists vehicle_models_manage on public.vehicle_models;
create policy vehicle_models_manage on public.vehicle_models
for all to authenticated
using (public.has_permission('settings.manage') or public.is_super_admin())
with check (public.has_permission('settings.manage') or public.is_super_admin());

drop policy if exists vehicle_model_years_manage on public.vehicle_model_years;
create policy vehicle_model_years_manage on public.vehicle_model_years
for all to authenticated
using (public.has_permission('settings.manage') or public.is_super_admin())
with check (public.has_permission('settings.manage') or public.is_super_admin());

drop policy if exists vehicle_variants_manage on public.vehicle_variants;
create policy vehicle_variants_manage on public.vehicle_variants
for all to authenticated
using (public.has_permission('settings.manage') or public.is_super_admin())
with check (public.has_permission('settings.manage') or public.is_super_admin());

drop policy if exists vehicle_catalog_mapping_unmatched_select on public.vehicle_catalog_mapping_unmatched;
create policy vehicle_catalog_mapping_unmatched_select on public.vehicle_catalog_mapping_unmatched
for select to authenticated
using (public.has_permission('settings.manage') or public.is_super_admin());
