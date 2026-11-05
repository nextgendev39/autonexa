-- Suppliers and acquisition records. Expenses stay on vehicle_expenses.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  emirate public.uae_emirate,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint suppliers_name_not_blank check (length(trim(name)) > 0),
  constraint suppliers_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  supplier_id uuid references public.suppliers (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  source public.vehicle_source not null,
  purchase_date date,
  purchase_price numeric(14, 2) not null default 0,
  currency char(3) not null default 'AED',
  status public.acquisition_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint acquisitions_purchase_price_non_negative check (purchase_price >= 0),
  constraint acquisitions_currency_format check (currency ~ '^[A-Z]{3}$')
);

alter table public.vehicle_expenses
  add constraint vehicle_expenses_acquisition_id_fkey
  foreign key (acquisition_id) references public.acquisitions (id) on delete set null;

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

create trigger acquisitions_set_updated_at
before update on public.acquisitions
for each row execute function public.set_updated_at();

comment on table public.acquisitions is
  'Vehicle intake records. Line-item costs go to vehicle_expenses with optional acquisition_id.';
