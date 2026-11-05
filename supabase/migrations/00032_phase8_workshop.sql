-- Phase 8: Workshop & Refurbishment Management.
-- Evolves Phase 3 workshop_orders / workshop_items (00011); integrates inspections + vehicle lifecycle.

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.workshop_type as enum ('internal', 'external_vendor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_job_status as enum (
    'pending', 'assigned', 'in_progress', 'waiting_for_parts',
    'waiting_for_vendor', 'completed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_job_type as enum (
    'mechanical', 'electrical', 'body_repair', 'paint', 'tyres', 'brakes',
    'suspension', 'ac', 'detailing', 'cleaning', 'glass', 'diagnostics',
    'general', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_part_status as enum (
    'requested', 'ordered', 'received', 'used', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_expense_type as enum (
    'transport', 'towing', 'outsourced_service', 'cleaning', 'detailing',
    'inspection', 'miscellaneous', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_hold_reason as enum (
    'waiting_for_approval', 'waiting_for_parts', 'waiting_for_vendor',
    'waiting_for_customer_decision', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_photo_category as enum (
    'before', 'during', 'after', 'part', 'damage', 'repair', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_quality_result as enum (
    'pass', 'fail', 'requires_rework'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Replace workshop_status (v2 swap)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'workshop_status' and e.enumlabel = 'open'
  ) then
    if not exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'workshop_status_v2'
    ) then
      create type public.workshop_status_v2 as enum (
        'draft', 'pending_approval', 'approved', 'scheduled', 'in_progress',
        'waiting_for_parts', 'waiting_for_vendor', 'quality_check',
        'completed', 'cancelled', 'on_hold'
      );
    end if;

    alter table public.workshop_orders alter column status drop default;

    alter table public.workshop_orders
      alter column status type public.workshop_status_v2
      using (
        case status::text
          when 'open' then 'draft'
          when 'in_progress' then 'in_progress'
          when 'waiting_parts' then 'waiting_for_parts'
          when 'waiting_for_parts' then 'waiting_for_parts'
          when 'completed' then 'completed'
          when 'cancelled' then 'cancelled'
          when 'draft' then 'draft'
          when 'pending_approval' then 'pending_approval'
          when 'approved' then 'approved'
          when 'scheduled' then 'scheduled'
          when 'waiting_for_vendor' then 'waiting_for_vendor'
          when 'quality_check' then 'quality_check'
          when 'on_hold' then 'on_hold'
          else 'draft'
        end
      )::public.workshop_status_v2;

    drop type public.workshop_status;
    alter type public.workshop_status_v2 rename to workshop_status;

    alter table public.workshop_orders
      alter column status set default 'draft'::public.workshop_status;
  end if;
end $$;

alter table public.workshop_orders
  alter column status set default 'draft'::public.workshop_status;

-- ---------------------------------------------------------------------------
-- Replace workshop_priority (v2 swap)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'workshop_priority' and e.enumlabel = 'medium'
  ) then
    if not exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'workshop_priority_v2'
    ) then
      create type public.workshop_priority_v2 as enum (
        'low', 'normal', 'high', 'urgent', 'critical'
      );
    end if;

    alter table public.workshop_orders alter column priority drop default;

    alter table public.workshop_orders
      alter column priority type public.workshop_priority_v2
      using (
        case priority::text
          when 'medium' then 'normal'
          when 'low' then 'low'
          when 'normal' then 'normal'
          when 'high' then 'high'
          when 'urgent' then 'urgent'
          when 'critical' then 'critical'
          else 'normal'
        end
      )::public.workshop_priority_v2;

    drop type public.workshop_priority;
    alter type public.workshop_priority_v2 rename to workshop_priority;

    alter table public.workshop_orders
      alter column priority set default 'normal'::public.workshop_priority;
  end if;
end $$;

alter table public.workshop_orders
  alter column priority set default 'normal'::public.workshop_priority;

-- ---------------------------------------------------------------------------
-- Expand workshop_orders
-- ---------------------------------------------------------------------------

alter table public.workshop_orders
  add column if not exists workshop_order_number text,
  add column if not exists source_inspection_id uuid references public.inspections (id) on delete set null,
  add column if not exists workshop_type public.workshop_type not null default 'internal',
  add column if not exists notes text,
  add column if not exists estimated_total_cost numeric(14, 2) not null default 0,
  add column if not exists actual_total_cost numeric(14, 2) not null default 0,
  add column if not exists scheduled_start_date date,
  add column if not exists scheduled_end_date date,
  add column if not exists actual_start_date timestamptz,
  add column if not exists actual_completion_date timestamptz,
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists completed_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists rejection_reason text,
  add column if not exists hold_reason public.workshop_hold_reason,
  add column if not exists hold_notes text,
  add column if not exists quality_result public.workshop_quality_result,
  add column if not exists quality_checked_by uuid references public.profiles (id) on delete set null,
  add column if not exists quality_checked_at timestamptz,
  add column if not exists quality_notes text,
  add column if not exists budget_override boolean not null default false,
  add column if not exists cost_locked boolean not null default false;

-- Backfills
update public.workshop_orders
set source_inspection_id = coalesce(source_inspection_id, inspection_id)
where source_inspection_id is null and inspection_id is not null;

update public.workshop_orders
set estimated_total_cost = coalesce(nullif(estimated_total_cost, 0), estimated_cost, 0),
    actual_total_cost = coalesce(nullif(actual_total_cost, 0), actual_cost, 0),
    actual_start_date = coalesce(actual_start_date, started_at),
    actual_completion_date = coalesce(actual_completion_date, completed_at);

update public.workshop_orders
set workshop_order_number = job_number
where (workshop_order_number is null or length(trim(workshop_order_number)) = 0)
  and job_number is not null
  and length(trim(job_number)) > 0;

do $$ begin
  alter table public.workshop_orders
    add constraint workshop_orders_estimated_total_non_negative
    check (estimated_total_cost >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.workshop_orders
    add constraint workshop_orders_actual_total_non_negative
    check (actual_total_cost >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.workshop_orders
    add constraint workshop_orders_schedule_dates
    check (
      scheduled_end_date is null
      or scheduled_start_date is null
      or scheduled_end_date >= scheduled_start_date
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.workshop_orders
    add constraint workshop_orders_actual_dates
    check (
      actual_completion_date is null
      or actual_start_date is null
      or actual_completion_date >= actual_start_date
    );
exception when duplicate_object then null; end $$;

-- Overdue is date-relative (not IMMUTABLE), so use STABLE helpers — not generated columns.
alter table public.workshop_orders drop column if exists is_overdue;

create or replace function public.workshop_uae_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Dubai', now()))::date;
$$;

create or replace function public.workshop_order_is_overdue(
  p_scheduled_end_date date,
  p_status public.workshop_status
)
returns boolean
language sql
stable
as $$
  select p_scheduled_end_date is not null
    and p_scheduled_end_date < public.workshop_uae_today()
    and p_status not in (
      'completed'::public.workshop_status,
      'cancelled'::public.workshop_status
    );
$$;

create or replace function public.workshop_job_is_overdue(
  p_estimated_end_date date,
  p_status public.workshop_job_status
)
returns boolean
language sql
stable
as $$
  select p_estimated_end_date is not null
    and p_estimated_end_date < public.workshop_uae_today()
    and p_status not in (
      'completed'::public.workshop_job_status,
      'cancelled'::public.workshop_job_status
    );
$$;

revoke all on function public.workshop_uae_today() from public;
revoke all on function public.workshop_order_is_overdue(date, public.workshop_status) from public;
revoke all on function public.workshop_job_is_overdue(date, public.workshop_job_status) from public;
grant execute on function public.workshop_uae_today() to authenticated, service_role;
grant execute on function public.workshop_order_is_overdue(date, public.workshop_status) to authenticated, service_role;
grant execute on function public.workshop_job_is_overdue(date, public.workshop_job_status) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Workshop order number generation (ZM-WO-000001)
-- ---------------------------------------------------------------------------

create sequence if not exists public.workshop_order_number_seq;

create or replace function public.next_workshop_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.workshop_order_number_seq');
  return 'ZM-WO-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_workshop_order_number() from public;
grant execute on function public.next_workshop_order_number() to authenticated, service_role;

create or replace function public.workshop_orders_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workshop_order_number is null or length(trim(new.workshop_order_number)) = 0 then
    new.workshop_order_number := public.next_workshop_order_number();
  end if;
  if new.job_number is null or length(trim(new.job_number)) = 0 then
    new.job_number := new.workshop_order_number;
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_orders_assign_number on public.workshop_orders;
create trigger workshop_orders_assign_number
before insert on public.workshop_orders
for each row execute function public.workshop_orders_assign_number();

do $$
declare
  r record;
  max_n bigint;
begin
  for r in
    select id from public.workshop_orders
    where workshop_order_number is null or length(trim(workshop_order_number)) = 0
    order by created_at, id
  loop
    update public.workshop_orders
    set workshop_order_number = public.next_workshop_order_number()
    where id = r.id;
  end loop;

  update public.workshop_orders
  set job_number = workshop_order_number
  where workshop_order_number is not null
    and (job_number is null or length(trim(job_number)) = 0 or job_number is distinct from workshop_order_number);

  select coalesce(max(
    case
      when workshop_order_number ~ '^ZM-WO-[0-9]+$'
        then substring(workshop_order_number from 7)::bigint
      else 0
    end
  ), 0)
  into max_n
  from public.workshop_orders;

  if max_n > 0 then
    perform setval('public.workshop_order_number_seq', max_n, true);
  end if;
end $$;

alter table public.workshop_orders
  alter column workshop_order_number set not null;

create unique index if not exists workshop_orders_workshop_order_number_unique
  on public.workshop_orders (workshop_order_number);

create index if not exists workshop_orders_vehicle_id_idx on public.workshop_orders (vehicle_id);
create index if not exists workshop_orders_branch_id_idx on public.workshop_orders (branch_id);
create index if not exists workshop_orders_status_idx on public.workshop_orders (status);
create index if not exists workshop_orders_priority_idx on public.workshop_orders (priority);
create index if not exists workshop_orders_created_at_idx on public.workshop_orders (created_at);
create index if not exists workshop_orders_source_inspection_id_idx on public.workshop_orders (source_inspection_id);
-- Supports overdue filters: scheduled_end < today AND not terminal.
create index if not exists workshop_orders_scheduled_end_active_idx
  on public.workshop_orders (scheduled_end_date)
  where scheduled_end_date is not null
    and status not in ('completed', 'cancelled');

-- Keep legacy cost columns in sync
create or replace function public.workshop_orders_sync_legacy_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.estimated_cost := coalesce(new.estimated_total_cost, 0);
  new.actual_cost := coalesce(new.actual_total_cost, 0);
  new.started_at := coalesce(new.actual_start_date, new.started_at);
  new.completed_at := coalesce(new.actual_completion_date, new.completed_at);
  if new.source_inspection_id is not null then
    new.inspection_id := new.source_inspection_id;
  elsif new.inspection_id is not null and new.source_inspection_id is null then
    new.source_inspection_id := new.inspection_id;
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_orders_sync_legacy_costs on public.workshop_orders;
create trigger workshop_orders_sync_legacy_costs
before insert or update on public.workshop_orders
for each row execute function public.workshop_orders_sync_legacy_costs();


-- ---------------------------------------------------------------------------
-- Vendors (external workshops / garages)
-- ---------------------------------------------------------------------------

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  branch_id uuid references public.branches (id) on delete set null,
  location_text text,
  status text not null default 'active',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vendors_name_not_blank check (length(trim(name)) > 0),
  constraint vendors_status_valid check (status in ('active', 'inactive')),
  constraint vendors_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
before update on public.vendors
for each row execute function public.set_updated_at();

create index if not exists vendors_branch_id_idx on public.vendors (branch_id);
create index if not exists vendors_status_idx on public.vendors (status);
alter table public.vendors enable row level security;

-- ---------------------------------------------------------------------------
-- Workshop jobs
-- ---------------------------------------------------------------------------

create sequence if not exists public.workshop_job_number_seq;

create or replace function public.next_workshop_job_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.workshop_job_number_seq');
  return 'ZM-WJ-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_workshop_job_number() from public;
grant execute on function public.next_workshop_job_number() to authenticated, service_role;

create table if not exists public.workshop_jobs (
  id uuid primary key default gen_random_uuid(),
  workshop_order_id uuid not null references public.workshop_orders (id) on delete cascade,
  inspection_finding_id uuid references public.inspection_findings (id) on delete set null,
  job_number text not null,
  job_type public.workshop_job_type not null default 'general',
  title text not null,
  description text,
  status public.workshop_job_status not null default 'pending',
  priority public.workshop_priority not null default 'normal',
  assigned_to uuid references public.profiles (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  estimated_cost numeric(14, 2) not null default 0,
  actual_cost numeric(14, 2) not null default 0,
  estimated_start_date date,
  estimated_end_date date,
  actual_start_date timestamptz,
  actual_completion_date timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint workshop_jobs_title_not_blank check (length(trim(title)) > 0),
  constraint workshop_jobs_estimated_cost_non_negative check (estimated_cost >= 0),
  constraint workshop_jobs_actual_cost_non_negative check (actual_cost >= 0),
  constraint workshop_jobs_assignment_xor check (
    not (assigned_to is not null and vendor_id is not null)
  ),
  constraint workshop_jobs_schedule_dates check (
    estimated_end_date is null
    or estimated_start_date is null
    or estimated_end_date >= estimated_start_date
  ),
  constraint workshop_jobs_actual_dates check (
    actual_completion_date is null
    or actual_start_date is null
    or actual_completion_date >= actual_start_date
  )
);

-- Overdue for jobs is computed via workshop_job_is_overdue() (STABLE), not a generated column.
alter table public.workshop_jobs drop column if exists is_overdue;

create index if not exists workshop_jobs_estimated_end_active_idx
  on public.workshop_jobs (estimated_end_date)
  where estimated_end_date is not null
    and status not in ('completed', 'cancelled');

create or replace function public.workshop_jobs_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_number is null or length(trim(new.job_number)) = 0 then
    new.job_number := public.next_workshop_job_number();
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_jobs_assign_number on public.workshop_jobs;
create trigger workshop_jobs_assign_number
before insert on public.workshop_jobs
for each row execute function public.workshop_jobs_assign_number();

drop trigger if exists workshop_jobs_set_updated_at on public.workshop_jobs;
create trigger workshop_jobs_set_updated_at
before update on public.workshop_jobs
for each row execute function public.set_updated_at();

create unique index if not exists workshop_jobs_job_number_unique
  on public.workshop_jobs (job_number);

-- Prevent duplicate conversion of the same finding into an active job
create unique index if not exists workshop_jobs_finding_active_unique
  on public.workshop_jobs (inspection_finding_id)
  where inspection_finding_id is not null
    and status <> 'cancelled'::public.workshop_job_status;

create index if not exists workshop_jobs_workshop_order_id_idx on public.workshop_jobs (workshop_order_id);
create index if not exists workshop_jobs_assigned_to_idx on public.workshop_jobs (assigned_to);
create index if not exists workshop_jobs_vendor_id_idx on public.workshop_jobs (vendor_id);
create index if not exists workshop_jobs_status_idx on public.workshop_jobs (status);
create index if not exists workshop_jobs_priority_idx on public.workshop_jobs (priority);
create index if not exists workshop_jobs_job_type_idx on public.workshop_jobs (job_type);

alter table public.workshop_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- Parts / labour / expenses
-- ---------------------------------------------------------------------------

create table if not exists public.workshop_job_parts (
  id uuid primary key default gen_random_uuid(),
  workshop_job_id uuid not null references public.workshop_jobs (id) on delete cascade,
  part_name text not null,
  part_number text,
  supplier text,
  quantity numeric(12, 2) not null default 1,
  unit_cost numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  status public.workshop_part_status not null default 'requested',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workshop_job_parts_name_not_blank check (length(trim(part_name)) > 0),
  constraint workshop_job_parts_quantity_positive check (quantity > 0),
  constraint workshop_job_parts_unit_cost_non_negative check (unit_cost >= 0),
  constraint workshop_job_parts_total_cost_non_negative check (total_cost >= 0)
);

create or replace function public.workshop_job_parts_calc_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.total_cost := round(coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0), 2);
  return new;
end;
$$;

drop trigger if exists workshop_job_parts_calc_total on public.workshop_job_parts;
create trigger workshop_job_parts_calc_total
before insert or update on public.workshop_job_parts
for each row execute function public.workshop_job_parts_calc_total();

drop trigger if exists workshop_job_parts_set_updated_at on public.workshop_job_parts;
create trigger workshop_job_parts_set_updated_at
before update on public.workshop_job_parts
for each row execute function public.set_updated_at();

create index if not exists workshop_job_parts_workshop_job_id_idx
  on public.workshop_job_parts (workshop_job_id);

alter table public.workshop_job_parts enable row level security;

create table if not exists public.workshop_job_labour (
  id uuid primary key default gen_random_uuid(),
  workshop_job_id uuid not null references public.workshop_jobs (id) on delete cascade,
  technician_id uuid references public.profiles (id) on delete set null,
  description text,
  hours numeric(10, 2) not null default 0,
  hourly_rate numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workshop_job_labour_hours_non_negative check (hours >= 0),
  constraint workshop_job_labour_hourly_rate_non_negative check (hourly_rate >= 0),
  constraint workshop_job_labour_total_cost_non_negative check (total_cost >= 0)
);

create or replace function public.workshop_job_labour_calc_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.total_cost := round(coalesce(new.hours, 0) * coalesce(new.hourly_rate, 0), 2);
  return new;
end;
$$;

drop trigger if exists workshop_job_labour_calc_total on public.workshop_job_labour;
create trigger workshop_job_labour_calc_total
before insert or update on public.workshop_job_labour
for each row execute function public.workshop_job_labour_calc_total();

drop trigger if exists workshop_job_labour_set_updated_at on public.workshop_job_labour;
create trigger workshop_job_labour_set_updated_at
before update on public.workshop_job_labour
for each row execute function public.set_updated_at();

create index if not exists workshop_job_labour_workshop_job_id_idx
  on public.workshop_job_labour (workshop_job_id);

alter table public.workshop_job_labour enable row level security;

create table if not exists public.workshop_expenses (
  id uuid primary key default gen_random_uuid(),
  workshop_order_id uuid not null references public.workshop_orders (id) on delete cascade,
  workshop_job_id uuid references public.workshop_jobs (id) on delete set null,
  expense_type public.workshop_expense_type not null default 'other',
  description text,
  vendor text,
  amount numeric(14, 2) not null default 0,
  currency char(3) not null default 'AED',
  expense_date date,
  reference text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workshop_expenses_amount_non_negative check (amount >= 0),
  constraint workshop_expenses_currency_format check (currency ~ '^[A-Z]{3}$')
);

drop trigger if exists workshop_expenses_set_updated_at on public.workshop_expenses;
create trigger workshop_expenses_set_updated_at
before update on public.workshop_expenses
for each row execute function public.set_updated_at();

create index if not exists workshop_expenses_workshop_order_id_idx
  on public.workshop_expenses (workshop_order_id);
create index if not exists workshop_expenses_workshop_job_id_idx
  on public.workshop_expenses (workshop_job_id);

alter table public.workshop_expenses enable row level security;

-- ---------------------------------------------------------------------------
-- Status history / photos / quality checks
-- ---------------------------------------------------------------------------

create table if not exists public.workshop_status_history (
  id uuid primary key default gen_random_uuid(),
  workshop_order_id uuid not null references public.workshop_orders (id) on delete cascade,
  from_status public.workshop_status,
  to_status public.workshop_status not null,
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists workshop_status_history_order_id_idx
  on public.workshop_status_history (workshop_order_id, changed_at desc);

alter table public.workshop_status_history enable row level security;

create table if not exists public.workshop_photos (
  id uuid primary key default gen_random_uuid(),
  workshop_order_id uuid not null references public.workshop_orders (id) on delete cascade,
  workshop_job_id uuid references public.workshop_jobs (id) on delete set null,
  category public.workshop_photo_category not null default 'other',
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size integer,
  caption text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workshop_photos_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint workshop_photos_file_size_non_negative check (file_size is null or file_size >= 0)
);

create index if not exists workshop_photos_order_id_idx on public.workshop_photos (workshop_order_id);
create index if not exists workshop_photos_job_id_idx on public.workshop_photos (workshop_job_id);

alter table public.workshop_photos enable row level security;

create table if not exists public.workshop_quality_checks (
  id uuid primary key default gen_random_uuid(),
  workshop_order_id uuid not null references public.workshop_orders (id) on delete cascade,
  result public.workshop_quality_result not null,
  notes text,
  checklist jsonb not null default '{}'::jsonb,
  performed_by uuid references public.profiles (id) on delete set null,
  performed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workshop_quality_checks_order_id_idx
  on public.workshop_quality_checks (workshop_order_id, performed_at desc);

alter table public.workshop_quality_checks enable row level security;


-- ---------------------------------------------------------------------------
-- Cost aggregation
-- ---------------------------------------------------------------------------

create or replace function public.workshop_cost_approval_threshold()
returns numeric
language sql
immutable
as $$
  select 1000::numeric;
$$;

create or replace function public.recalculate_workshop_job_actual_cost(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parts numeric(14,2);
  v_labour numeric(14,2);
  v_expenses numeric(14,2);
begin
  select coalesce(sum(total_cost), 0) into v_parts
  from public.workshop_job_parts
  where workshop_job_id = p_job_id
    and status <> 'cancelled';

  select coalesce(sum(total_cost), 0) into v_labour
  from public.workshop_job_labour
  where workshop_job_id = p_job_id;

  select coalesce(sum(amount), 0) into v_expenses
  from public.workshop_expenses
  where workshop_job_id = p_job_id;

  update public.workshop_jobs
  set actual_cost = round(v_parts + v_labour + v_expenses, 2),
      updated_at = timezone('utc', now())
  where id = p_job_id;
end;
$$;

create or replace function public.recalculate_workshop_order_costs(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_parts numeric(14,2);
  v_labour numeric(14,2);
  v_expenses numeric(14,2);
  v_job_est numeric(14,2);
begin
  select cost_locked into v_locked
  from public.workshop_orders
  where id = p_order_id
  for update;

  if not found then
    return;
  end if;

  if v_locked then
    return;
  end if;

  select coalesce(sum(p.total_cost), 0) into v_parts
  from public.workshop_job_parts p
  join public.workshop_jobs j on j.id = p.workshop_job_id
  where j.workshop_order_id = p_order_id
    and p.status <> 'cancelled'
    and j.status <> 'cancelled';

  select coalesce(sum(l.total_cost), 0) into v_labour
  from public.workshop_job_labour l
  join public.workshop_jobs j on j.id = l.workshop_job_id
  where j.workshop_order_id = p_order_id
    and j.status <> 'cancelled';

  select coalesce(sum(e.amount), 0) into v_expenses
  from public.workshop_expenses e
  where e.workshop_order_id = p_order_id;

  select coalesce(sum(estimated_cost), 0) into v_job_est
  from public.workshop_jobs
  where workshop_order_id = p_order_id
    and status <> 'cancelled';

  update public.workshop_orders
  set
    actual_total_cost = round(v_parts + v_labour + v_expenses, 2),
    estimated_total_cost = greatest(estimated_total_cost, v_job_est),
    updated_at = timezone('utc', now())
  where id = p_order_id;
end;
$$;

create or replace function public.trg_recalc_workshop_costs_from_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_order_id uuid;
begin
  v_job_id := coalesce(new.workshop_job_id, old.workshop_job_id);
  if v_job_id is not null then
    perform public.recalculate_workshop_job_actual_cost(v_job_id);
    select workshop_order_id into v_order_id from public.workshop_jobs where id = v_job_id;
  end if;
  if tg_table_name = 'workshop_expenses' then
    v_order_id := coalesce(new.workshop_order_id, old.workshop_order_id, v_order_id);
  end if;
  if v_order_id is not null then
    perform public.recalculate_workshop_order_costs(v_order_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists workshop_job_parts_recalc on public.workshop_job_parts;
create trigger workshop_job_parts_recalc
after insert or update or delete on public.workshop_job_parts
for each row execute function public.trg_recalc_workshop_costs_from_job();

drop trigger if exists workshop_job_labour_recalc on public.workshop_job_labour;
create trigger workshop_job_labour_recalc
after insert or update or delete on public.workshop_job_labour
for each row execute function public.trg_recalc_workshop_costs_from_job();

drop trigger if exists workshop_expenses_recalc on public.workshop_expenses;
create trigger workshop_expenses_recalc
after insert or update or delete on public.workshop_expenses
for each row execute function public.trg_recalc_workshop_costs_from_job();

create or replace function public.trg_recalc_workshop_costs_from_job_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_workshop_order_costs(coalesce(new.workshop_order_id, old.workshop_order_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists workshop_jobs_recalc_order on public.workshop_jobs;
create trigger workshop_jobs_recalc_order
after insert or update of estimated_cost, status or delete on public.workshop_jobs
for each row execute function public.trg_recalc_workshop_costs_from_job_row();

create or replace function public.read_workshop_costs(p_order_id uuid)
returns table (
  parts_total numeric,
  labour_total numeric,
  expenses_total numeric,
  actual_total numeric,
  estimated_total numeric,
  variance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch from public.workshop_orders where id = p_order_id;
  if not found then
    raise exception 'workshop order not found';
  end if;
  if not public.has_permission_for_branch('workshop.cost.view', v_branch) then
    raise exception 'not authorized';
  end if;

  return query
  select
    coalesce((
      select sum(p.total_cost)
      from public.workshop_job_parts p
      join public.workshop_jobs j on j.id = p.workshop_job_id
      where j.workshop_order_id = p_order_id
        and p.status <> 'cancelled'
        and j.status <> 'cancelled'
    ), 0),
    coalesce((
      select sum(l.total_cost)
      from public.workshop_job_labour l
      join public.workshop_jobs j on j.id = l.workshop_job_id
      where j.workshop_order_id = p_order_id
        and j.status <> 'cancelled'
    ), 0),
    coalesce((
      select sum(e.amount)
      from public.workshop_expenses e
      where e.workshop_order_id = p_order_id
    ), 0),
    o.actual_total_cost,
    o.estimated_total_cost,
    round(o.actual_total_cost - o.estimated_total_cost, 2)
  from public.workshop_orders o
  where o.id = p_order_id;
end;
$$;

revoke all on function public.read_workshop_costs(uuid) from public;
grant execute on function public.read_workshop_costs(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Status transitions
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_workshop_status_transition(
  p_from public.workshop_status,
  p_to public.workshop_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_from = 'draft' and p_to in ('pending_approval', 'cancelled') then true
    when p_from = 'pending_approval' and p_to in ('approved', 'draft', 'cancelled') then true
    when p_from = 'approved' and p_to in ('scheduled', 'in_progress', 'pending_approval', 'cancelled', 'on_hold') then true
    when p_from = 'scheduled' and p_to in ('in_progress', 'on_hold', 'cancelled') then true
    when p_from = 'in_progress' and p_to in ('waiting_for_parts', 'waiting_for_vendor', 'on_hold', 'quality_check', 'cancelled') then true
    when p_from = 'waiting_for_parts' and p_to in ('in_progress', 'on_hold', 'cancelled') then true
    when p_from = 'waiting_for_vendor' and p_to in ('in_progress', 'on_hold', 'cancelled') then true
    when p_from = 'on_hold' and p_to in ('in_progress', 'scheduled', 'cancelled', 'pending_approval') then true
    when p_from = 'quality_check' and p_to in ('completed', 'in_progress', 'cancelled') then true
    else false
  end;
$$;

create or replace function public.is_valid_workshop_job_status_transition(
  p_from public.workshop_job_status,
  p_to public.workshop_job_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_from = 'pending' and p_to in ('assigned', 'in_progress', 'cancelled') then true
    when p_from = 'assigned' and p_to in ('in_progress', 'cancelled') then true
    when p_from = 'in_progress' and p_to in ('waiting_for_parts', 'waiting_for_vendor', 'completed', 'cancelled') then true
    when p_from = 'waiting_for_parts' and p_to in ('in_progress', 'cancelled') then true
    when p_from = 'waiting_for_vendor' and p_to in ('in_progress', 'cancelled') then true
    when p_from = 'completed' and p_to = 'in_progress' then true
    else false
  end;
$$;

create or replace function public.enforce_workshop_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and not public.is_valid_workshop_status_transition(old.status, new.status) then
    raise exception 'invalid workshop status transition: % → %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_orders_enforce_status on public.workshop_orders;
create trigger workshop_orders_enforce_status
before update of status on public.workshop_orders
for each row execute function public.enforce_workshop_status_transition();

create or replace function public.enforce_workshop_job_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and not public.is_valid_workshop_job_status_transition(old.status, new.status) then
    raise exception 'invalid workshop job status transition: % → %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_jobs_enforce_status on public.workshop_jobs;
create trigger workshop_jobs_enforce_status
before update of status on public.workshop_jobs
for each row execute function public.enforce_workshop_job_status_transition();

create or replace function public.track_workshop_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    v_reason := nullif(current_setting('app.workshop_status_reason', true), '');
    insert into public.workshop_status_history (
      workshop_order_id, from_status, to_status, reason, changed_by
    ) values (
      new.id, old.status, new.status, v_reason, auth.uid()
    );
  elsif tg_op = 'INSERT' then
    insert into public.workshop_status_history (
      workshop_order_id, from_status, to_status, reason, changed_by
    ) values (
      new.id, null, new.status, 'created', auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_orders_track_status on public.workshop_orders;
create trigger workshop_orders_track_status
after insert or update of status on public.workshop_orders
for each row execute function public.track_workshop_status_change();


-- ---------------------------------------------------------------------------
-- Workflow RPCs
-- ---------------------------------------------------------------------------

create or replace function public.submit_workshop_for_approval(p_order_id uuid)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.edit', v_row.branch_id)
     and not public.has_permission_for_branch('workshop.create', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status is distinct from 'draft' then
    raise exception 'workshop order must be draft to submit for approval';
  end if;
  perform set_config('app.workshop_status_reason', 'submitted for approval', true);
  update public.workshop_orders
  set status = 'pending_approval', updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  perform public.write_audit_log(
    'WORKSHOP_ORDER_UPDATED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'pending_approval'),
    '{}'::jsonb
  );
  return v_row;
end;
$$;

create or replace function public.approve_workshop_order(p_order_id uuid, p_note text default null)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status is distinct from 'pending_approval' then
    raise exception 'workshop order is not pending approval';
  end if;
  perform set_config('app.workshop_status_reason', coalesce(nullif(trim(p_note), ''), 'approved'), true);
  update public.workshop_orders
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = timezone('utc', now()),
      rejection_reason = null,
      updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  perform public.write_audit_log(
    'WORKSHOP_ORDER_APPROVED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'pending_approval'),
    jsonb_build_object('status', 'approved', 'approved_by', auth.uid()),
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
  );
  return v_row;
end;
$$;

create or replace function public.reject_workshop_order(p_order_id uuid, p_reason text)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status is distinct from 'pending_approval' then
    raise exception 'workshop order is not pending approval';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'rejection reason required';
  end if;
  perform set_config('app.workshop_status_reason', trim(p_reason), true);
  update public.workshop_orders
  set status = 'draft',
      rejection_reason = trim(p_reason),
      updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  perform public.write_audit_log(
    'WORKSHOP_ORDER_REJECTED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'pending_approval'),
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('reason', trim(p_reason))
  );
  return v_row;
end;
$$;

create or replace function public.return_workshop_for_changes(p_order_id uuid, p_reason text)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.reject_workshop_order(p_order_id, p_reason);
end;
$$;

create or replace function public.schedule_workshop_order(
  p_order_id uuid,
  p_start date default null,
  p_end date default null
)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status not in ('approved', 'on_hold') then
    raise exception 'workshop order cannot be scheduled from %', v_row.status;
  end if;
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'scheduled_end must be on or after scheduled_start';
  end if;
  perform set_config('app.workshop_status_reason', 'scheduled', true);
  update public.workshop_orders
  set status = 'scheduled',
      scheduled_start_date = coalesce(p_start, scheduled_start_date),
      scheduled_end_date = coalesce(p_end, scheduled_end_date),
      hold_reason = null,
      hold_notes = null,
      updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  perform public.write_audit_log(
    'WORKSHOP_ORDER_UPDATED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'scheduled'),
    '{}'::jsonb
  );
  return v_row;
end;
$$;

create or replace function public.start_workshop_order(p_order_id uuid)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
  v_vehicle public.vehicles%rowtype;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.edit', v_row.branch_id)
     and not public.has_permission_for_branch('workshop.job.start', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status not in ('approved', 'scheduled', 'on_hold') then
    raise exception 'workshop order cannot be started from %', v_row.status;
  end if;
  perform set_config('app.workshop_status_reason', 'started', true);
  update public.workshop_orders
  set status = 'in_progress',
      actual_start_date = coalesce(actual_start_date, timezone('utc', now())),
      hold_reason = null,
      hold_notes = null,
      updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;

  select * into v_vehicle from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if found
     and v_vehicle.status in ('under_inspection', 'inspection_failed', 'ready_for_sale')
     and public.is_valid_vehicle_status_transition(v_vehicle.status, 'under_repair') then
    perform set_config('app.vehicle_status_reason', 'workshop started', true);
    update public.vehicles
    set status = 'under_repair', updated_by = auth.uid()
    where id = v_vehicle.id;
  end if;

  perform public.write_audit_log(
    'WORKSHOP_ORDER_UPDATED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'started_from'),
    jsonb_build_object('status', 'in_progress'),
    '{}'::jsonb
  );
  return v_row;
end;
$$;

create or replace function public.hold_workshop_order(
  p_order_id uuid,
  p_reason public.workshop_hold_reason,
  p_notes text default null
)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status not in ('approved', 'scheduled', 'in_progress', 'waiting_for_parts', 'waiting_for_vendor') then
    raise exception 'workshop order cannot be held from %', v_row.status;
  end if;
  perform set_config('app.workshop_status_reason', coalesce(p_reason::text, 'on_hold'), true);
  update public.workshop_orders
  set status = 'on_hold',
      hold_reason = p_reason,
      hold_notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.cancel_workshop_order(p_order_id uuid, p_reason text)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
  v_elevated boolean;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.cancel', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status in ('completed', 'cancelled') then
    raise exception 'workshop order cannot be cancelled';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'cancellation reason required';
  end if;
  v_elevated := v_row.status in (
    'in_progress', 'waiting_for_parts', 'waiting_for_vendor', 'quality_check', 'on_hold'
  );
  if v_elevated and not public.has_permission_for_branch('workshop.approve', v_row.branch_id) then
    raise exception 'elevated permission required to cancel started workshop work';
  end if;
  perform set_config('app.workshop_status_reason', trim(p_reason), true);
  update public.workshop_orders
  set status = 'cancelled',
      cancelled_at = timezone('utc', now()),
      cancel_reason = trim(p_reason),
      updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  perform public.write_audit_log(
    'WORKSHOP_ORDER_CANCELLED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'prior'),
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('reason', trim(p_reason))
  );
  return v_row;
end;
$$;

create or replace function public.submit_workshop_quality_check(p_order_id uuid)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
  v_open int;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.edit', v_row.branch_id)
     and not public.has_permission_for_branch('workshop.job.complete', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status not in ('in_progress', 'waiting_for_parts', 'waiting_for_vendor') then
    raise exception 'workshop order cannot enter quality check from %', v_row.status;
  end if;
  select count(*)::int into v_open
  from public.workshop_jobs
  where workshop_order_id = p_order_id
    and status not in ('completed', 'cancelled');
  if v_open > 0 then
    raise exception 'incomplete jobs blocked (%)', v_open;
  end if;
  perform set_config('app.workshop_status_reason', 'submitted for quality check', true);
  update public.workshop_orders
  set status = 'quality_check', updated_by = auth.uid()
  where id = p_order_id
  returning * into v_row;
  perform public.write_audit_log(
    'WORKSHOP_QUALITY_CHECK_STARTED', 'workshop_orders', p_order_id,
    jsonb_build_object('status', 'in_progress'),
    jsonb_build_object('status', 'quality_check'),
    '{}'::jsonb
  );
  return v_row;
end;
$$;

create or replace function public.perform_workshop_quality_check(
  p_order_id uuid,
  p_result public.workshop_quality_result,
  p_notes text default null,
  p_checklist jsonb default '{}'::jsonb
)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_critical int;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.quality_check', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status is distinct from 'quality_check' then
    raise exception 'workshop order is not in quality check';
  end if;
  if v_row.completed_by is not null and v_row.completed_by = auth.uid() then
    raise exception 'self approval is not allowed';
  end if;

  insert into public.workshop_quality_checks (
    workshop_order_id, result, notes, checklist, performed_by
  ) values (
    p_order_id, p_result, nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_checklist, '{}'::jsonb), auth.uid()
  );

  if p_result = 'pass' then
    select count(*)::int into v_critical
    from public.inspection_findings f
    where f.inspection_id = v_row.source_inspection_id
      and f.severity = 'critical'
      and f.is_resolved = false;

    if v_critical > 0 then
      raise exception 'unresolved critical findings (%)', v_critical;
    end if;

    perform set_config('app.workshop_status_reason', coalesce(nullif(trim(p_notes), ''), 'quality passed'), true);
    update public.workshop_orders
    set status = 'completed',
        quality_result = p_result,
        quality_notes = nullif(trim(coalesce(p_notes, '')), ''),
        quality_checked_by = auth.uid(),
        quality_checked_at = timezone('utc', now()),
        completed_by = coalesce(completed_by, auth.uid()),
        actual_completion_date = coalesce(actual_completion_date, timezone('utc', now())),
        cost_locked = true,
        updated_by = auth.uid()
    where id = p_order_id
    returning * into v_row;

    select * into v_vehicle from public.vehicles
    where id = v_row.vehicle_id and deleted_at is null
    for update;

    if found
       and v_vehicle.status = 'under_repair'
       and public.is_valid_vehicle_status_transition(v_vehicle.status, 'ready_for_sale') then
      perform set_config('app.vehicle_status_reason', 'workshop quality passed', true);
      update public.vehicles
      set status = 'ready_for_sale', updated_by = auth.uid()
      where id = v_vehicle.id;
    end if;

    perform public.write_audit_log(
      'WORKSHOP_QUALITY_CHECK_APPROVED', 'workshop_orders', p_order_id,
      jsonb_build_object('status', 'quality_check'),
      jsonb_build_object('status', 'completed', 'quality_result', p_result),
      jsonb_build_object('notes', nullif(trim(coalesce(p_notes, '')), ''))
    );
  else
    perform set_config('app.workshop_status_reason', coalesce(nullif(trim(p_notes), ''), 'quality rework'), true);
    update public.workshop_orders
    set status = 'in_progress',
        quality_result = p_result,
        quality_notes = nullif(trim(coalesce(p_notes, '')), ''),
        quality_checked_by = auth.uid(),
        quality_checked_at = timezone('utc', now()),
        updated_by = auth.uid()
    where id = p_order_id
    returning * into v_row;

    perform public.write_audit_log(
      'WORKSHOP_QUALITY_CHECK_REJECTED', 'workshop_orders', p_order_id,
      jsonb_build_object('status', 'quality_check'),
      jsonb_build_object('status', 'in_progress', 'quality_result', p_result),
      jsonb_build_object('notes', nullif(trim(coalesce(p_notes, '')), ''))
    );
  end if;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------------
-- Job RPCs
-- ---------------------------------------------------------------------------

create or replace function public.assign_workshop_job(
  p_job_id uuid,
  p_assigned_to uuid default null,
  p_vendor_id uuid default null
)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_branch uuid;
begin
  select j.* into v_job from public.workshop_jobs j where j.id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select branch_id into v_branch from public.workshop_orders where id = v_job.workshop_order_id;
  if not public.has_permission_for_branch('workshop.job.assign', v_branch)
     and not public.has_permission_for_branch('workshop.edit', v_branch) then
    raise exception 'not authorized';
  end if;
  if p_assigned_to is not null and p_vendor_id is not null then
    raise exception 'assign either technician or vendor, not both';
  end if;
  if v_job.status not in ('pending', 'assigned') then
    raise exception 'job cannot be assigned from %', v_job.status;
  end if;
  update public.workshop_jobs
  set assigned_to = p_assigned_to,
      vendor_id = p_vendor_id,
      status = case
        when p_assigned_to is not null or p_vendor_id is not null then 'assigned'::public.workshop_job_status
        else status
      end,
      updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;
  perform public.write_audit_log(
    'WORKSHOP_JOB_ASSIGNED', 'workshop_jobs', p_job_id,
    '{}'::jsonb,
    jsonb_build_object('assigned_to', p_assigned_to, 'vendor_id', p_vendor_id, 'status', v_job.status),
    '{}'::jsonb
  );
  return v_job;
end;
$$;

create or replace function public.start_workshop_job(p_job_id uuid)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_order public.workshop_orders%rowtype;
begin
  select * into v_job from public.workshop_jobs where id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select * into v_order from public.workshop_orders where id = v_job.workshop_order_id for update;
  if not public.has_permission_for_branch('workshop.job.start', v_order.branch_id)
     and not public.has_permission_for_branch('workshop.edit', v_order.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_job.assigned_to is not null
     and v_job.assigned_to <> auth.uid()
     and not public.has_permission_for_branch('workshop.job.assign', v_order.branch_id)
     and not public.has_permission_for_branch('workshop.edit', v_order.branch_id) then
    raise exception 'not authorized for this job';
  end if;
  if not public.is_valid_workshop_job_status_transition(v_job.status, 'in_progress') then
    raise exception 'invalid workshop job status transition: % → in_progress', v_job.status;
  end if;
  update public.workshop_jobs
  set status = 'in_progress',
      actual_start_date = coalesce(actual_start_date, timezone('utc', now())),
      updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;

  if v_order.status in ('approved', 'scheduled', 'on_hold') then
    perform public.start_workshop_order(v_order.id);
  end if;

  perform public.write_audit_log(
    'WORKSHOP_JOB_STARTED', 'workshop_jobs', p_job_id,
    '{}'::jsonb,
    jsonb_build_object('status', 'in_progress'),
    '{}'::jsonb
  );
  return v_job;
end;
$$;

create or replace function public.complete_workshop_job(p_job_id uuid)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_branch uuid;
begin
  select * into v_job from public.workshop_jobs where id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select branch_id into v_branch from public.workshop_orders where id = v_job.workshop_order_id;
  if not public.has_permission_for_branch('workshop.job.complete', v_branch)
     and not public.has_permission_for_branch('workshop.edit', v_branch) then
    raise exception 'not authorized';
  end if;
  if v_job.status is distinct from 'in_progress' then
    raise exception 'job must be in progress to complete';
  end if;
  update public.workshop_jobs
  set status = 'completed',
      actual_completion_date = timezone('utc', now()),
      completed_at = timezone('utc', now()),
      completed_by = auth.uid(),
      updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;
  perform public.write_audit_log(
    'WORKSHOP_JOB_COMPLETED', 'workshop_jobs', p_job_id,
    '{}'::jsonb,
    jsonb_build_object('status', 'completed'),
    '{}'::jsonb
  );
  return v_job;
end;
$$;

create or replace function public.set_workshop_job_waiting_parts(p_job_id uuid)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_order public.workshop_orders%rowtype;
begin
  select * into v_job from public.workshop_jobs where id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select * into v_order from public.workshop_orders where id = v_job.workshop_order_id for update;
  if not public.has_permission_for_branch('workshop.job.edit', v_order.branch_id)
     and not public.has_permission_for_branch('workshop.edit', v_order.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_job.status is distinct from 'in_progress' then
    raise exception 'job must be in progress';
  end if;
  update public.workshop_jobs
  set status = 'waiting_for_parts', updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;
  if v_order.status = 'in_progress' then
    perform set_config('app.workshop_status_reason', 'waiting for parts', true);
    update public.workshop_orders
    set status = 'waiting_for_parts', updated_by = auth.uid()
    where id = v_order.id;
  end if;
  return v_job;
end;
$$;

create or replace function public.set_workshop_job_waiting_vendor(p_job_id uuid)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_order public.workshop_orders%rowtype;
begin
  select * into v_job from public.workshop_jobs where id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select * into v_order from public.workshop_orders where id = v_job.workshop_order_id for update;
  if not public.has_permission_for_branch('workshop.job.edit', v_order.branch_id)
     and not public.has_permission_for_branch('workshop.edit', v_order.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_job.status is distinct from 'in_progress' then
    raise exception 'job must be in progress';
  end if;
  update public.workshop_jobs
  set status = 'waiting_for_vendor', updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;
  if v_order.status = 'in_progress' then
    perform set_config('app.workshop_status_reason', 'waiting for vendor', true);
    update public.workshop_orders
    set status = 'waiting_for_vendor', updated_by = auth.uid()
    where id = v_order.id;
  end if;
  return v_job;
end;
$$;

create or replace function public.resume_workshop_job(p_job_id uuid)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_order public.workshop_orders%rowtype;
begin
  select * into v_job from public.workshop_jobs where id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select * into v_order from public.workshop_orders where id = v_job.workshop_order_id for update;
  if not public.has_permission_for_branch('workshop.job.edit', v_order.branch_id)
     and not public.has_permission_for_branch('workshop.edit', v_order.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_job.status not in ('waiting_for_parts', 'waiting_for_vendor', 'completed') then
    raise exception 'job cannot resume from %', v_job.status;
  end if;
  update public.workshop_jobs
  set status = 'in_progress',
      completed_at = null,
      actual_completion_date = case when v_job.status = 'completed' then null else actual_completion_date end,
      updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;
  if v_order.status in ('waiting_for_parts', 'waiting_for_vendor', 'quality_check') then
    perform set_config('app.workshop_status_reason', 'resumed', true);
    update public.workshop_orders
    set status = 'in_progress', updated_by = auth.uid()
    where id = v_order.id;
  end if;
  return v_job;
end;
$$;

create or replace function public.cancel_workshop_job(p_job_id uuid, p_reason text default null)
returns public.workshop_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.workshop_jobs%rowtype;
  v_branch uuid;
begin
  select * into v_job from public.workshop_jobs where id = p_job_id for update;
  if not found then raise exception 'workshop job not found'; end if;
  select branch_id into v_branch from public.workshop_orders where id = v_job.workshop_order_id;
  if not public.has_permission_for_branch('workshop.job.edit', v_branch)
     and not public.has_permission_for_branch('workshop.edit', v_branch) then
    raise exception 'not authorized';
  end if;
  if v_job.status in ('completed', 'cancelled') then
    raise exception 'job cannot be cancelled';
  end if;
  update public.workshop_jobs
  set status = 'cancelled',
      notes = case
        when p_reason is null or length(trim(p_reason)) = 0 then notes
        else trim(coalesce(notes || E'\n', '') || 'Cancelled: ' || trim(p_reason))
      end,
      updated_by = auth.uid()
  where id = p_job_id
  returning * into v_job;
  perform public.write_audit_log(
    'WORKSHOP_JOB_CANCELLED', 'workshop_jobs', p_job_id,
    '{}'::jsonb,
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
  return v_job;
end;
$$;

create or replace function public.bump_workshop_estimate(
  p_order_id uuid,
  p_new_estimate numeric,
  p_override boolean default false
)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
  v_delta numeric;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.cost.edit', v_row.branch_id)
     and not public.has_permission_for_branch('workshop.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if p_new_estimate is null or p_new_estimate < 0 then
    raise exception 'invalid estimate';
  end if;
  if v_row.cost_locked then
    raise exception 'completed workshop costs are locked';
  end if;
  v_delta := p_new_estimate - v_row.estimated_total_cost;
  if v_row.status in ('approved', 'scheduled', 'in_progress', 'waiting_for_parts', 'waiting_for_vendor', 'on_hold')
     and v_delta > public.workshop_cost_approval_threshold() then
    if p_override then
      if not public.has_permission_for_branch('workshop.cost.override', v_row.branch_id) then
        raise exception 'workshop.cost.override required';
      end if;
      update public.workshop_orders
      set estimated_total_cost = p_new_estimate,
          budget_override = true,
          updated_by = auth.uid()
      where id = p_order_id
      returning * into v_row;
    else
      perform set_config('app.workshop_status_reason', 'estimate increased; reapproval required', true);
      update public.workshop_orders
      set estimated_total_cost = p_new_estimate,
          status = 'pending_approval',
          updated_by = auth.uid()
      where id = p_order_id
      returning * into v_row;
    end if;
  else
    update public.workshop_orders
    set estimated_total_cost = p_new_estimate,
        updated_by = auth.uid()
    where id = p_order_id
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.create_workshop_from_inspection(
  p_inspection_id uuid,
  p_finding_ids uuid[],
  p_branch_id uuid default null,
  p_priority public.workshop_priority default 'normal',
  p_workshop_type public.workshop_type default 'internal',
  p_description text default null,
  p_allow_duplicates boolean default false
)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insp public.inspections%rowtype;
  v_order public.workshop_orders%rowtype;
  v_finding public.inspection_findings%rowtype;
  v_fid uuid;
  v_branch uuid;
  v_created int := 0;
  v_existing text;
  v_job_type public.workshop_job_type;
begin
  select * into v_insp from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'inspection not found'; end if;
  if v_insp.status is distinct from 'approved' then
    raise exception 'inspection must be approved';
  end if;
  v_branch := coalesce(p_branch_id, v_insp.branch_id);
  if not public.has_permission_for_branch('workshop.create', v_branch) then
    raise exception 'not authorized';
  end if;
  if p_finding_ids is null or array_length(p_finding_ids, 1) is null then
    raise exception 'at least one finding required';
  end if;

  insert into public.workshop_orders (
    workshop_order_number, job_number, vehicle_id, branch_id,
    source_inspection_id, inspection_id, status, priority, workshop_type,
    description, created_by, updated_by
  ) values (
    '', '', v_insp.vehicle_id, v_branch,
    v_insp.id, v_insp.id, 'draft', coalesce(p_priority, 'normal'),
    coalesce(p_workshop_type, 'internal'),
    nullif(trim(coalesce(p_description, '')), ''),
    auth.uid(), auth.uid()
  )
  returning * into v_order;

  foreach v_fid in array p_finding_ids
  loop
    select * into v_finding from public.inspection_findings where id = v_fid and inspection_id = p_inspection_id;
    if not found then
      raise exception 'finding % not on inspection', v_fid;
    end if;

    select wo.workshop_order_number into v_existing
    from public.workshop_jobs wj
    join public.workshop_orders wo on wo.id = wj.workshop_order_id
    where wj.inspection_finding_id = v_fid
      and wj.status <> 'cancelled'
    limit 1;

    if v_existing is not null and not p_allow_duplicates then
      raise exception 'finding already assigned to Workshop Order %', v_existing;
    end if;

    if v_existing is not null and p_allow_duplicates then
      if not public.has_permission_for_branch('workshop.job.create', v_branch) then
        raise exception 'not authorized to create duplicate finding jobs';
      end if;
    end if;

    v_job_type := case
      when lower(coalesce(v_finding.title, '')) like '%brake%' then 'brakes'::public.workshop_job_type
      when lower(coalesce(v_finding.title, '')) like '%ac%' or lower(coalesce(v_finding.title, '')) like '%air%' then 'ac'::public.workshop_job_type
      when lower(coalesce(v_finding.title, '')) like '%tyre%' or lower(coalesce(v_finding.title, '')) like '%tire%' then 'tyres'::public.workshop_job_type
      when lower(coalesce(v_finding.title, '')) like '%paint%' or lower(coalesce(v_finding.title, '')) like '%scratch%' then 'paint'::public.workshop_job_type
      when lower(coalesce(v_finding.title, '')) like '%glass%' then 'glass'::public.workshop_job_type
      when v_finding.damage_type::text like '%electrical%' then 'electrical'::public.workshop_job_type
      when v_finding.damage_type::text like '%mechanical%' then 'mechanical'::public.workshop_job_type
      else 'general'::public.workshop_job_type
    end;

    begin
      insert into public.workshop_jobs (
        workshop_order_id, inspection_finding_id, job_number, job_type, title,
        description, status, priority, estimated_cost, created_by, updated_by
      ) values (
        v_order.id, v_finding.id, '', v_job_type, v_finding.title,
        coalesce(v_finding.recommended_action, v_finding.description),
        'pending',
        case when v_finding.severity = 'critical' then 'critical'::public.workshop_priority
             when v_finding.severity = 'major' then 'high'::public.workshop_priority
             else coalesce(p_priority, 'normal') end,
        coalesce(v_finding.estimated_cost, 0),
        auth.uid(), auth.uid()
      );
      v_created := v_created + 1;
    exception
      when unique_violation then
        if not p_allow_duplicates then
          raise exception 'finding already assigned to a workshop job';
        end if;
    end;
  end loop;

  if v_created = 0 then
    delete from public.workshop_orders where id = v_order.id;
    raise exception 'no eligible findings converted';
  end if;

  perform public.recalculate_workshop_order_costs(v_order.id);
  select * into v_order from public.workshop_orders where id = v_order.id;

  perform public.write_audit_log(
    'WORKSHOP_ORDER_CREATED', 'workshop_orders', v_order.id,
    null,
    jsonb_build_object(
      'workshop_order_number', v_order.workshop_order_number,
      'source_inspection_id', p_inspection_id,
      'jobs_created', v_created
    ),
    '{}'::jsonb
  );

  return v_order;
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants for RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.submit_workshop_for_approval(uuid) from public;
revoke all on function public.approve_workshop_order(uuid, text) from public;
revoke all on function public.reject_workshop_order(uuid, text) from public;
revoke all on function public.return_workshop_for_changes(uuid, text) from public;
revoke all on function public.schedule_workshop_order(uuid, date, date) from public;
revoke all on function public.start_workshop_order(uuid) from public;
revoke all on function public.hold_workshop_order(uuid, public.workshop_hold_reason, text) from public;
revoke all on function public.cancel_workshop_order(uuid, text) from public;
revoke all on function public.submit_workshop_quality_check(uuid) from public;
revoke all on function public.perform_workshop_quality_check(uuid, public.workshop_quality_result, text, jsonb) from public;
revoke all on function public.assign_workshop_job(uuid, uuid, uuid) from public;
revoke all on function public.start_workshop_job(uuid) from public;
revoke all on function public.complete_workshop_job(uuid) from public;
revoke all on function public.set_workshop_job_waiting_parts(uuid) from public;
revoke all on function public.set_workshop_job_waiting_vendor(uuid) from public;
revoke all on function public.resume_workshop_job(uuid) from public;
revoke all on function public.cancel_workshop_job(uuid, text) from public;
revoke all on function public.bump_workshop_estimate(uuid, numeric, boolean) from public;
revoke all on function public.create_workshop_from_inspection(uuid, uuid[], uuid, public.workshop_priority, public.workshop_type, text, boolean) from public;
revoke all on function public.is_valid_workshop_status_transition(public.workshop_status, public.workshop_status) from public;
revoke all on function public.is_valid_workshop_job_status_transition(public.workshop_job_status, public.workshop_job_status) from public;
revoke all on function public.recalculate_workshop_order_costs(uuid) from public;
revoke all on function public.workshop_cost_approval_threshold() from public;

grant execute on function public.submit_workshop_for_approval(uuid) to authenticated, service_role;
grant execute on function public.approve_workshop_order(uuid, text) to authenticated, service_role;
grant execute on function public.reject_workshop_order(uuid, text) to authenticated, service_role;
grant execute on function public.return_workshop_for_changes(uuid, text) to authenticated, service_role;
grant execute on function public.schedule_workshop_order(uuid, date, date) to authenticated, service_role;
grant execute on function public.start_workshop_order(uuid) to authenticated, service_role;
grant execute on function public.hold_workshop_order(uuid, public.workshop_hold_reason, text) to authenticated, service_role;
grant execute on function public.cancel_workshop_order(uuid, text) to authenticated, service_role;
grant execute on function public.submit_workshop_quality_check(uuid) to authenticated, service_role;
grant execute on function public.perform_workshop_quality_check(uuid, public.workshop_quality_result, text, jsonb) to authenticated, service_role;
grant execute on function public.assign_workshop_job(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.start_workshop_job(uuid) to authenticated, service_role;
grant execute on function public.complete_workshop_job(uuid) to authenticated, service_role;
grant execute on function public.set_workshop_job_waiting_parts(uuid) to authenticated, service_role;
grant execute on function public.set_workshop_job_waiting_vendor(uuid) to authenticated, service_role;
grant execute on function public.resume_workshop_job(uuid) to authenticated, service_role;
grant execute on function public.cancel_workshop_job(uuid, text) to authenticated, service_role;
grant execute on function public.bump_workshop_estimate(uuid, numeric, boolean) to authenticated, service_role;
grant execute on function public.create_workshop_from_inspection(uuid, uuid[], uuid, public.workshop_priority, public.workshop_type, text, boolean) to authenticated, service_role;
grant execute on function public.is_valid_workshop_status_transition(public.workshop_status, public.workshop_status) to authenticated, service_role;
grant execute on function public.is_valid_workshop_job_status_transition(public.workshop_job_status, public.workshop_job_status) to authenticated, service_role;
grant execute on function public.workshop_cost_approval_threshold() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permissions + roles
-- ---------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system)
values (
  'technician',
  'Technician',
  'Workshop technician — assigned job execution without financial approval',
  true
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    is_system = excluded.is_system,
    updated_at = timezone('utc', now());

insert into public.permissions (key, name, module, description)
values
  ('workshop.approve', 'Approve workshop orders', 'workshop', 'Approve or reject workshop orders and cost reapproval'),
  ('workshop.cancel', 'Cancel workshop orders', 'workshop', 'Cancel workshop orders'),
  ('workshop.job.view', 'View workshop jobs', 'workshop', 'View workshop jobs including assigned queue'),
  ('workshop.job.create', 'Create workshop jobs', 'workshop', 'Create workshop jobs'),
  ('workshop.job.edit', 'Edit workshop jobs', 'workshop', 'Edit workshop job details and progress'),
  ('workshop.job.assign', 'Assign workshop jobs', 'workshop', 'Assign technicians or vendors to jobs'),
  ('workshop.job.start', 'Start workshop jobs', 'workshop', 'Start workshop jobs'),
  ('workshop.job.complete', 'Complete workshop jobs', 'workshop', 'Complete workshop jobs'),
  ('workshop.parts.view', 'View workshop parts', 'workshop', 'View workshop parts'),
  ('workshop.parts.create', 'Create workshop parts', 'workshop', 'Record workshop parts'),
  ('workshop.parts.edit', 'Edit workshop parts', 'workshop', 'Edit workshop parts'),
  ('workshop.labour.view', 'View workshop labour', 'workshop', 'View workshop labour entries'),
  ('workshop.labour.create', 'Create workshop labour', 'workshop', 'Record workshop labour'),
  ('workshop.labour.edit', 'Edit workshop labour', 'workshop', 'Edit workshop labour'),
  ('workshop.expense.view', 'View workshop expenses', 'workshop', 'View other workshop expenses'),
  ('workshop.expense.create', 'Create workshop expenses', 'workshop', 'Create other workshop expenses'),
  ('workshop.expense.edit', 'Edit workshop expenses', 'workshop', 'Edit other workshop expenses'),
  ('workshop.cost.view', 'View workshop costs', 'workshop', 'View estimated and actual workshop costs'),
  ('workshop.cost.edit', 'Edit workshop costs', 'workshop', 'Edit workshop cost estimates and rates'),
  ('workshop.cost.override', 'Override workshop budget', 'workshop', 'Override budget threshold without reapproval'),
  ('workshop.quality_check', 'Workshop quality check', 'workshop', 'Perform workshop quality checks'),
  ('workshop.photo.view', 'View workshop photos', 'workshop', 'View workshop photos'),
  ('workshop.photo.create', 'Upload workshop photos', 'workshop', 'Upload workshop photos'),
  ('workshop.photo.delete', 'Delete workshop photos', 'workshop', 'Delete workshop photos')
on conflict (key) do update
set name = excluded.name,
    module = excluded.module,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('super_admin', 'admin')
  and p.key like 'workshop.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workshop.view', 'workshop.create', 'workshop.edit', 'workshop.approve', 'workshop.cancel',
  'workshop.job.view', 'workshop.job.create', 'workshop.job.edit', 'workshop.job.assign',
  'workshop.job.start', 'workshop.job.complete',
  'workshop.parts.view', 'workshop.parts.create', 'workshop.parts.edit',
  'workshop.labour.view', 'workshop.labour.create', 'workshop.labour.edit',
  'workshop.expense.view', 'workshop.expense.create', 'workshop.expense.edit',
  'workshop.cost.view', 'workshop.cost.edit', 'workshop.cost.override',
  'workshop.quality_check',
  'workshop.photo.view', 'workshop.photo.create', 'workshop.photo.delete'
)
where r.key in ('general_manager', 'workshop_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view',
  'workshop.view',
  'workshop.job.view', 'workshop.job.edit', 'workshop.job.start', 'workshop.job.complete',
  'workshop.parts.view', 'workshop.parts.create', 'workshop.parts.edit',
  'workshop.labour.view', 'workshop.labour.create',
  'workshop.photo.view', 'workshop.photo.create',
  'notification.view'
)
where r.key = 'technician'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workshop.view', 'workshop.cost.view', 'workshop.expense.view', 'workshop.job.view'
)
where r.key = 'accountant'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workshop.view', 'workshop.job.view', 'workshop.photo.view'
)
where r.key in ('inventory_manager', 'viewer', 'sales_executive')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

drop policy if exists "workshop_orders_select" on public.workshop_orders;
drop policy if exists "workshop_orders_insert" on public.workshop_orders;
drop policy if exists "workshop_orders_update" on public.workshop_orders;

create policy "workshop_orders_select"
  on public.workshop_orders for select to authenticated
  using (public.has_permission_for_branch('workshop.view', branch_id));

create policy "workshop_orders_insert"
  on public.workshop_orders for insert to authenticated
  with check (public.has_permission_for_branch('workshop.create', branch_id));

create policy "workshop_orders_update"
  on public.workshop_orders for update to authenticated
  using (
    public.has_permission_for_branch('workshop.edit', branch_id)
    or public.has_permission_for_branch('workshop.approve', branch_id)
    or public.has_permission_for_branch('workshop.cancel', branch_id)
    or public.has_permission_for_branch('workshop.quality_check', branch_id)
  )
  with check (
    public.has_permission_for_branch('workshop.edit', branch_id)
    or public.has_permission_for_branch('workshop.approve', branch_id)
    or public.has_permission_for_branch('workshop.cancel', branch_id)
    or public.has_permission_for_branch('workshop.quality_check', branch_id)
  );

drop policy if exists "workshop_items_select" on public.workshop_items;
drop policy if exists "workshop_items_mutate" on public.workshop_items;

create policy "workshop_items_select"
  on public.workshop_items for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.view', w.branch_id)
    )
  );

create policy "workshop_items_mutate"
  on public.workshop_items for all to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.edit', w.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.edit', w.branch_id)
    )
  );

create policy "workshop_jobs_select"
  on public.workshop_jobs for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.job.view', w.branch_id)
          or public.has_permission_for_branch('workshop.view', w.branch_id)
          or assigned_to = auth.uid()
        )
    )
  );

create policy "workshop_jobs_insert"
  on public.workshop_jobs for insert to authenticated
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.job.create', w.branch_id)
          or public.has_permission_for_branch('workshop.create', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
    )
  );

create policy "workshop_jobs_update"
  on public.workshop_jobs for update to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.job.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.job.assign', w.branch_id)
          or public.has_permission_for_branch('workshop.job.start', w.branch_id)
          or public.has_permission_for_branch('workshop.job.complete', w.branch_id)
          or assigned_to = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.job.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.job.assign', w.branch_id)
          or public.has_permission_for_branch('workshop.job.start', w.branch_id)
          or public.has_permission_for_branch('workshop.job.complete', w.branch_id)
          or assigned_to = auth.uid()
        )
    )
  );

create policy "workshop_job_parts_select"
  on public.workshop_job_parts for select to authenticated
  using (
    exists (
      select 1 from public.workshop_jobs j
      join public.workshop_orders w on w.id = j.workshop_order_id
      where j.id = workshop_job_id
        and (
          public.has_permission_for_branch('workshop.parts.view', w.branch_id)
          or public.has_permission_for_branch('workshop.view', w.branch_id)
          or j.assigned_to = auth.uid()
        )
    )
  );

create policy "workshop_job_parts_mutate"
  on public.workshop_job_parts for all to authenticated
  using (
    exists (
      select 1 from public.workshop_jobs j
      join public.workshop_orders w on w.id = j.workshop_order_id
      where j.id = workshop_job_id
        and (
          public.has_permission_for_branch('workshop.parts.create', w.branch_id)
          or public.has_permission_for_branch('workshop.parts.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
          or j.assigned_to = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1 from public.workshop_jobs j
      join public.workshop_orders w on w.id = j.workshop_order_id
      where j.id = workshop_job_id
        and (
          public.has_permission_for_branch('workshop.parts.create', w.branch_id)
          or public.has_permission_for_branch('workshop.parts.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
          or j.assigned_to = auth.uid()
        )
    )
  );

create policy "workshop_job_labour_select"
  on public.workshop_job_labour for select to authenticated
  using (
    exists (
      select 1 from public.workshop_jobs j
      join public.workshop_orders w on w.id = j.workshop_order_id
      where j.id = workshop_job_id
        and (
          public.has_permission_for_branch('workshop.labour.view', w.branch_id)
          or public.has_permission_for_branch('workshop.view', w.branch_id)
          or j.assigned_to = auth.uid()
          or technician_id = auth.uid()
        )
    )
  );

create policy "workshop_job_labour_mutate"
  on public.workshop_job_labour for all to authenticated
  using (
    exists (
      select 1 from public.workshop_jobs j
      join public.workshop_orders w on w.id = j.workshop_order_id
      where j.id = workshop_job_id
        and (
          public.has_permission_for_branch('workshop.labour.create', w.branch_id)
          or public.has_permission_for_branch('workshop.labour.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.workshop_jobs j
      join public.workshop_orders w on w.id = j.workshop_order_id
      where j.id = workshop_job_id
        and (
          public.has_permission_for_branch('workshop.labour.create', w.branch_id)
          or public.has_permission_for_branch('workshop.labour.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
    )
  );

create policy "workshop_expenses_select"
  on public.workshop_expenses for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.expense.view', w.branch_id)
          or public.has_permission_for_branch('workshop.cost.view', w.branch_id)
          or public.has_permission_for_branch('workshop.view', w.branch_id)
        )
    )
  );

create policy "workshop_expenses_mutate"
  on public.workshop_expenses for all to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.expense.create', w.branch_id)
          or public.has_permission_for_branch('workshop.expense.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.expense.create', w.branch_id)
          or public.has_permission_for_branch('workshop.expense.edit', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
    )
  );

create policy "workshop_status_history_select"
  on public.workshop_status_history for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.view', w.branch_id)
    )
  );

create policy "workshop_photos_select"
  on public.workshop_photos for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.photo.view', w.branch_id)
          or public.has_permission_for_branch('workshop.view', w.branch_id)
        )
    )
  );

create policy "workshop_photos_insert"
  on public.workshop_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.photo.create', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
    )
  );

create policy "workshop_photos_delete"
  on public.workshop_photos for delete to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and (
          public.has_permission_for_branch('workshop.photo.delete', w.branch_id)
          or public.has_permission_for_branch('workshop.edit', w.branch_id)
        )
        and w.status not in ('completed', 'cancelled')
    )
  );

create policy "workshop_quality_checks_select"
  on public.workshop_quality_checks for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.view', w.branch_id)
    )
  );

create policy "workshop_quality_checks_insert"
  on public.workshop_quality_checks for insert to authenticated
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.quality_check', w.branch_id)
    )
  );

create policy "vendors_select"
  on public.vendors for select to authenticated
  using (
    public.has_permission_for_optional_branch('workshop.view', branch_id)
    or public.has_permission_for_optional_branch('workshop.job.view', branch_id)
  );

create policy "vendors_mutate"
  on public.vendors for all to authenticated
  using (
    public.has_permission_for_optional_branch('workshop.edit', branch_id)
    or public.has_permission_for_optional_branch('workshop.create', branch_id)
  )
  with check (
    public.has_permission_for_optional_branch('workshop.edit', branch_id)
    or public.has_permission_for_optional_branch('workshop.create', branch_id)
  );

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workshop-photos',
  'workshop-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_workshop_storage(p_order_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workshop_orders w
    where w.id = p_order_id
      and (
        (not p_write and (
          public.has_permission_for_branch('workshop.photo.view', w.branch_id)
          or public.has_permission_for_branch('workshop.view', w.branch_id)
        ))
        or (
          p_write and (
            public.has_permission_for_branch('workshop.photo.create', w.branch_id)
            or public.has_permission_for_branch('workshop.edit', w.branch_id)
          )
        )
      )
  );
$$;

revoke all on function public.can_access_workshop_storage(uuid, boolean) from public;
grant execute on function public.can_access_workshop_storage(uuid, boolean) to authenticated;

drop policy if exists "storage_workshop_photos_select" on storage.objects;
drop policy if exists "storage_workshop_photos_insert" on storage.objects;
drop policy if exists "storage_workshop_photos_update" on storage.objects;
drop policy if exists "storage_workshop_photos_delete" on storage.objects;

create policy "storage_workshop_photos_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'workshop-photos'
    and public.can_access_workshop_storage(public.storage_entity_id(name), false)
  );

create policy "storage_workshop_photos_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'workshop-photos'
    and public.can_access_workshop_storage(public.storage_entity_id(name), true)
  );

create policy "storage_workshop_photos_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'workshop-photos'
    and public.can_access_workshop_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'workshop-photos'
    and public.can_access_workshop_storage(public.storage_entity_id(name), true)
  );

create policy "storage_workshop_photos_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'workshop-photos'
    and public.can_access_workshop_storage(public.storage_entity_id(name), true)
  );

comment on table public.workshop_orders is
  'Workshop/refurbishment orders for a vehicle. Actual costs from parts+labour+expenses; inspection estimates stay on findings.';
comment on table public.workshop_jobs is
  'Individual workshop tasks; optional inspection_finding_id links conversion from Phase 7.';
comment on table public.workshop_job_parts is
  'Workshop part line items. total_cost = quantity × unit_cost.';
comment on table public.workshop_job_labour is
  'Workshop labour line items. total_cost = hours × hourly_rate.';
comment on table public.workshop_expenses is
  'Other workshop expenses (transport, towing, outsourced, etc.).';
comment on function public.perform_workshop_quality_check is
  'Quality gate before vehicle may become ready_for_sale. PASS locks costs and may update vehicle lifecycle.';
comment on function public.create_workshop_from_inspection is
  'Creates a workshop order and jobs from selected inspection findings with duplicate protection.';
