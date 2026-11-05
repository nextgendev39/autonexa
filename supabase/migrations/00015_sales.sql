-- Sales and optional sale price negotiation history.
-- A sale does not require a reservation.

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  reservation_id uuid references public.reservations (id) on delete set null,
  salesperson_id uuid references public.profiles (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  status public.sale_status not null default 'quotation',
  vehicle_price numeric(14, 2) not null,
  discount_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  final_amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  sale_date date,
  delivery_date date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_number_unique unique (sale_number),
  constraint sales_vehicle_price_non_negative check (vehicle_price >= 0),
  constraint sales_discount_non_negative check (discount_amount >= 0),
  constraint sales_tax_non_negative check (tax_amount >= 0),
  constraint sales_final_amount_non_negative check (final_amount >= 0),
  constraint sales_currency_format check (currency ~ '^[A-Z]{3}$')
);

-- A non-cancelled sale should map to at most one vehicle.
create unique index sales_one_open_per_vehicle
  on public.sales (vehicle_id)
  where status <> 'cancelled';

create table public.sale_price_history (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  old_amount numeric(14, 2),
  new_amount numeric(14, 2) not null,
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sale_price_history_old_non_negative check (old_amount is null or old_amount >= 0),
  constraint sale_price_history_new_non_negative check (new_amount >= 0)
);

create trigger sales_set_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

comment on table public.sales is
  'Vehicle sales. Cancel via status, never hard-delete. Optional reservation_id.';
comment on index public.sales_one_open_per_vehicle is
  'Prevents multiple non-cancelled sales against the same vehicle.';
