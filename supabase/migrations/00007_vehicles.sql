-- Central inventory entity.

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  stock_number text not null,
  vin text,
  make text not null,
  model text not null,
  variant text,
  year integer not null,
  mileage integer not null default 0,
  exterior_color text,
  interior_color text,
  body_type text,
  transmission public.transmission_type,
  fuel_type public.fuel_type,
  engine_size text,
  seats integer,
  doors integer,
  origin_type public.vehicle_origin,
  country_of_origin text,
  condition public.vehicle_condition,
  branch_id uuid not null references public.branches (id),
  source public.vehicle_source not null default 'other',
  status public.vehicle_status not null default 'acquired',
  purchase_date date,
  registration_expiry date,
  description text,
  total_acquisition_cost numeric(14, 2) not null default 0,
  current_selling_price numeric(14, 2),
  minimum_selling_price numeric(14, 2),
  currency char(3) not null default 'AED',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicles_stock_number_not_blank check (length(trim(stock_number)) > 0),
  constraint vehicles_make_not_blank check (length(trim(make)) > 0),
  constraint vehicles_model_not_blank check (length(trim(model)) > 0),
  constraint vehicles_year_range check (year >= 1980 and year <= extract(year from timezone('utc', now()))::integer + 1),
  constraint vehicles_mileage_non_negative check (mileage >= 0),
  constraint vehicles_seats_positive check (seats is null or seats > 0),
  constraint vehicles_doors_positive check (doors is null or doors > 0),
  constraint vehicles_acquisition_cost_non_negative check (total_acquisition_cost >= 0),
  constraint vehicles_selling_price_non_negative check (
    current_selling_price is null or current_selling_price >= 0
  ),
  constraint vehicles_minimum_price_non_negative check (
    minimum_selling_price is null or minimum_selling_price >= 0
  ),
  constraint vehicles_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint vehicles_vin_format check (
    vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'
  )
);

create unique index vehicles_stock_number_active_unique
  on public.vehicles (stock_number)
  where deleted_at is null;

create unique index vehicles_vin_active_unique
  on public.vehicles (vin)
  where deleted_at is null and vin is not null;

create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

comment on table public.vehicles is
  'Inventory vehicles. Soft-deleted with deleted_at. Active VIN and stock_number are unique.';
