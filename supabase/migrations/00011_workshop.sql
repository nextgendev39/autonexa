-- Workshop / repair orders linked to vehicles and optional inspections.

create table public.workshop_orders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  inspection_id uuid references public.inspections (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  job_number text not null,
  status public.workshop_status not null default 'open',
  priority public.workshop_priority not null default 'medium',
  assigned_to uuid references public.profiles (id) on delete set null,
  description text,
  estimated_cost numeric(14, 2) not null default 0,
  actual_cost numeric(14, 2) not null default 0,
  currency char(3) not null default 'AED',
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workshop_orders_job_number_unique unique (job_number),
  constraint workshop_orders_estimated_cost_non_negative check (estimated_cost >= 0),
  constraint workshop_orders_actual_cost_non_negative check (actual_cost >= 0),
  constraint workshop_orders_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint workshop_orders_completed_after_started check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table public.workshop_items (
  id uuid primary key default gen_random_uuid(),
  workshop_order_id uuid not null references public.workshop_orders (id) on delete cascade,
  item_type public.workshop_item_type not null default 'other',
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_cost numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  vendor text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workshop_items_description_not_blank check (length(trim(description)) > 0),
  constraint workshop_items_quantity_positive check (quantity > 0),
  constraint workshop_items_unit_cost_non_negative check (unit_cost >= 0),
  constraint workshop_items_total_cost_non_negative check (total_cost >= 0)
);

create trigger workshop_orders_set_updated_at
before update on public.workshop_orders
for each row execute function public.set_updated_at();

create trigger workshop_items_set_updated_at
before update on public.workshop_items
for each row execute function public.set_updated_at();
