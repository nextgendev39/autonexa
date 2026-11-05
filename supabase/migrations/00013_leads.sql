-- Leads, configurable sources, and activity timeline.

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint lead_sources_key_unique unique (key),
  constraint lead_sources_name_not_blank check (length(trim(name)) > 0)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_number text not null,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  source_id uuid references public.lead_sources (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  assigned_to uuid references public.profiles (id) on delete set null,
  status public.lead_status not null default 'new',
  estimated_value numeric(14, 2),
  currency char(3) not null default 'AED',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint leads_lead_number_not_blank check (length(trim(lead_number)) > 0),
  constraint leads_estimated_value_non_negative check (
    estimated_value is null or estimated_value >= 0
  ),
  constraint leads_currency_format check (currency ~ '^[A-Z]{3}$')
);

create unique index leads_number_active_unique
  on public.leads (lead_number)
  where deleted_at is null;

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  activity_type public.lead_activity_type not null,
  subject text,
  description text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create trigger lead_sources_set_updated_at
before update on public.lead_sources
for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

comment on table public.lead_sources is
  'Configurable lead channels. Seeded defaults; do not hardcode in the UI.';
comment on table public.leads is 'Sales pipeline opportunities. Soft-deleted.';
