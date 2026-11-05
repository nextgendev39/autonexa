-- Reservations. At most one ACTIVE reservation per vehicle (partial unique index).

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text not null,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  lead_id uuid references public.leads (id) on delete set null,
  salesperson_id uuid references public.profiles (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  amount numeric(14, 2) not null default 0,
  currency char(3) not null default 'AED',
  status public.reservation_status not null default 'active',
  reserved_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  cancel_reason text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reservations_number_unique unique (reservation_number),
  constraint reservations_amount_non_negative check (amount >= 0),
  constraint reservations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint reservations_expires_after_reserved check (expires_at > reserved_at)
);

-- Database-level protection: a vehicle cannot have two ACTIVE reservations.
create unique index reservations_one_active_per_vehicle
  on public.reservations (vehicle_id)
  where status = 'active';

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

comment on index public.reservations_one_active_per_vehicle is
  'Enforces one ACTIVE reservation per vehicle. Expired/cancelled/converted rows are excluded.';
