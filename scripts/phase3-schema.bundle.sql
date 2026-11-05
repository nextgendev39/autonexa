-- AutoNexa Phase 3 schema bundle (migrations 00001–00024 concatenated).
-- Prefer applying via: npx supabase db reset (local) or npx supabase db push (linked).
-- After schema: run supabase/seed.sql separately.
-- This file is a convenience for SQL Editor pastes when the CLI cannot reach Docker/remote.

-- Phase 3: required PostgreSQL extensions for AutoNexa.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;
-- Controlled business states. Prefer lookup tables for values the business will customize often.

do $$ begin
  create type public.uae_emirate as enum (
    'abu_dhabi',
    'dubai',
    'sharjah',
    'ajman',
    'umm_al_quwain',
    'ras_al_khaimah',
    'fujairah'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum (
    'active',
    'invited',
    'suspended',
    'disabled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_status as enum (
    'acquired',
    'under_inspection',
    'inspection_failed',
    'under_repair',
    'ready_for_sale',
    'reserved',
    'sold',
    'delivered',
    'returned',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_source as enum (
    'direct_purchase',
    'auction',
    'trade_in',
    'import',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_condition as enum (
    'excellent',
    'good',
    'fair',
    'poor'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transmission_type as enum (
    'automatic',
    'manual',
    'cvt',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fuel_type as enum (
    'petrol',
    'diesel',
    'hybrid',
    'electric',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_origin as enum (
    'gcc',
    'imported'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_expense_category as enum (
    'purchase',
    'auction',
    'transportation',
    'customs',
    'registration',
    'repair',
    'detailing',
    'inspection',
    'advertising',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_photo_category as enum (
    'front',
    'rear',
    'left',
    'right',
    'interior',
    'dashboard',
    'engine',
    'odometer',
    'tyres',
    'damage',
    'vin',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.acquisition_status as enum (
    'draft',
    'pending',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_status as enum (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_result as enum (
    'pass',
    'pass_with_repairs',
    'fail'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_item_result as enum (
    'pass',
    'warning',
    'fail',
    'not_applicable'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_status as enum (
    'open',
    'in_progress',
    'waiting_parts',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_priority as enum (
    'low',
    'medium',
    'high',
    'urgent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_item_type as enum (
    'part',
    'labor',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum (
    'new',
    'contacted',
    'interested',
    'test_drive',
    'negotiation',
    'reserved',
    'won',
    'lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_activity_type as enum (
    'call',
    'whatsapp',
    'email',
    'note',
    'meeting',
    'test_drive',
    'follow_up',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reservation_status as enum (
    'active',
    'expired',
    'cancelled',
    'converted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sale_status as enum (
    'quotation',
    'negotiation',
    'booked',
    'payment_pending',
    'paid',
    'delivery_pending',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'pending',
    'partial',
    'paid',
    'failed',
    'refunded',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum (
    'cash',
    'bank_transfer',
    'card',
    'financing',
    'deposit',
    'installment',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum (
    'draft',
    'issued',
    'paid',
    'partially_paid',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum (
    'active',
    'expired',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.preferred_language as enum (
    'en',
    'ar'
  );
exception when duplicate_object then null; end $$;
-- Shared helpers: updated_at maintenance and current profile id.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at to UTC now() on row update. Applied by triggers; never rely on the client.';

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

comment on function public.current_profile_id() is
  'Authenticated profile id. profiles.id mirrors auth.users.id.';
-- Branches across UAE emirates. manager_user_id is constrained after profiles exist.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  emirate public.uae_emirate not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  postal_code text,
  phone text,
  email text,
  manager_user_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branches_code_unique unique (code),
  constraint branches_name_not_blank check (length(trim(name)) > 0),
  constraint branches_code_not_blank check (length(trim(code)) > 0),
  constraint branches_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

comment on table public.branches is 'Physical dealership locations. Emirate uses the uae_emirate enum.';
-- Staff profiles. Authentication credentials live only in auth.users.
-- profiles.id === auth.users.id (standard Supabase pattern).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_code text,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  phone text,
  avatar_url text,
  branch_id uuid references public.branches (id) on delete set null,
  status public.user_status not null default 'invited',
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_employee_code_unique unique (employee_code),
  constraint profiles_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint profiles_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint profiles_display_name_not_blank check (length(trim(display_name)) > 0)
);

alter table public.branches
  add constraint branches_manager_user_id_fkey
  foreign key (manager_user_id) references public.profiles (id) on delete set null;

alter table public.profiles
  add constraint profiles_deleted_by_fkey
  foreign key (deleted_by) references public.profiles (id) on delete set null;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create a minimal profile when a user is invited/signed up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name text;
begin
  full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    phone,
    status
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), full_name),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), '-'),
    full_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'invited'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

comment on table public.profiles is
  'Staff identity linked 1:1 with auth.users. Soft-deleted with deleted_at.';
-- RBAC foundation. Permission keys are the source of truth for Phase 4 RLS.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint roles_key_unique unique (key),
  constraint roles_key_not_blank check (length(trim(key)) > 0),
  constraint roles_name_not_blank check (length(trim(name)) > 0)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  module text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint permissions_key_unique unique (key),
  constraint permissions_key_format check (key ~ '^[a-z0-9]+(\.[a-z0-9_]+)+$'),
  constraint permissions_module_not_blank check (length(trim(module)) > 0)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index user_roles_branch_unique
  on public.user_roles (user_id, role_id, branch_id)
  where branch_id is not null;

create unique index user_roles_global_unique
  on public.user_roles (user_id, role_id)
  where branch_id is null;

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

comment on table public.roles is 'Named roles. Seeded system roles should not be deleted casually.';
comment on table public.permissions is 'Permission keys such as vehicle.view. Frontend must not invent permissions.';
comment on table public.user_roles is
  'Assigns roles to users. Optional branch_id scopes the assignment for Phase 4 RLS.';
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
-- Vehicle financial detail, pricing audit, status audit, and photo metadata.
-- Decision: use a single vehicle_expenses table (no separate acquisition_expenses).
-- Optional acquisition_id links purchase-related rows without duplicating the model.

create table public.vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  acquisition_id uuid,
  category public.vehicle_expense_category not null,
  description text,
  amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  expense_date date not null default (timezone('utc', now()))::date,
  reference_number text,
  vendor_name text,
  document_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_expenses_amount_non_negative check (amount >= 0),
  constraint vehicle_expenses_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.vehicle_price_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  old_price numeric(14, 2),
  new_price numeric(14, 2) not null,
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_price_history_old_non_negative check (old_price is null or old_price >= 0),
  constraint vehicle_price_history_new_non_negative check (new_price >= 0)
);

create table public.vehicle_status_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  old_status public.vehicle_status,
  new_status public.vehicle_status not null,
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null,
  category public.vehicle_photo_category not null default 'other',
  file_name text not null,
  mime_type text,
  file_size integer,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_photos_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint vehicle_photos_file_size_non_negative check (file_size is null or file_size >= 0)
);

create unique index vehicle_photos_one_primary
  on public.vehicle_photos (vehicle_id)
  where is_primary = true;

create trigger vehicle_expenses_set_updated_at
before update on public.vehicle_expenses
for each row execute function public.set_updated_at();

create trigger vehicle_photos_set_updated_at
before update on public.vehicle_photos
for each row execute function public.set_updated_at();

comment on table public.vehicle_expenses is
  'Unified vehicle cost ledger. Prefer this over a separate acquisition_expenses table.';
comment on table public.vehicle_price_history is 'Append-only selling price changes for auditability.';
comment on table public.vehicle_status_history is 'Append-only vehicle lifecycle status changes.';
comment on table public.vehicle_photos is
  'Photo metadata only. Binary files live in Supabase Storage (vehicle-photos bucket).';
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
-- Configurable inspection templates and inspection runs.

create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_templates_name_not_blank check (length(trim(name)) > 0)
);

create table public.inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates (id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_template_items_name_not_blank check (length(trim(name)) > 0),
  constraint inspection_template_items_category_not_blank check (length(trim(category)) > 0)
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  template_id uuid references public.inspection_templates (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  inspector_id uuid references public.profiles (id) on delete set null,
  status public.inspection_status not null default 'pending',
  result public.inspection_result,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspections_completed_after_started check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  template_item_id uuid references public.inspection_template_items (id) on delete set null,
  name text not null,
  category text not null,
  result public.inspection_item_result,
  notes text,
  severity text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_items_name_not_blank check (length(trim(name)) > 0)
);

create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  inspection_item_id uuid references public.inspection_items (id) on delete set null,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inspection_photos_storage_path_not_blank check (length(trim(storage_path)) > 0)
);

create trigger inspection_templates_set_updated_at
before update on public.inspection_templates
for each row execute function public.set_updated_at();

create trigger inspection_template_items_set_updated_at
before update on public.inspection_template_items
for each row execute function public.set_updated_at();

create trigger inspections_set_updated_at
before update on public.inspections
for each row execute function public.set_updated_at();

create trigger inspection_items_set_updated_at
before update on public.inspection_items
for each row execute function public.set_updated_at();

comment on table public.inspection_templates is
  'Editable checklists. Categories such as Exterior/Interior are data, not app constants.';
comment on table public.inspection_photos is
  'Inspection image metadata. Files in the inspection-photos storage bucket.';
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
-- Customers. Soft-deleted. Keep PII minimal and business-relevant.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  phone text not null,
  email text,
  nationality text,
  emirate public.uae_emirate,
  city text,
  address text,
  preferred_language public.preferred_language not null default 'en',
  branch_id uuid references public.branches (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customers_customer_code_not_blank check (length(trim(customer_code)) > 0),
  constraint customers_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint customers_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint customers_phone_not_blank check (length(trim(phone)) > 0),
  constraint customers_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

create unique index customers_code_active_unique
  on public.customers (customer_code)
  where deleted_at is null;

create unique index customers_phone_active_unique
  on public.customers (phone)
  where deleted_at is null;

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

comment on table public.customers is
  'CRM customers. Soft-deleted. Active phone numbers are unique.';
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
-- Payments with allocation support for future multi-sale / multi-invoice accounting.
-- Decision: payments hold the money movement; payment_allocations link amounts to sales
-- (and later invoices). payments.sale_id remains as a convenience primary target when
-- a payment has a single sale. Preferred write path for Phase 5+: create payment +
-- allocation rows in one transaction.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null,
  sale_id uuid references public.sales (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete set null,
  amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  reference_number text,
  payment_date date not null default (timezone('utc', now()))::date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payments_number_unique unique (payment_number),
  constraint payments_amount_positive check (amount > 0),
  constraint payments_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete restrict,
  amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  created_at timestamptz not null default timezone('utc', now()),
  constraint payment_allocations_amount_positive check (amount > 0),
  constraint payment_allocations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payment_allocations_unique_sale unique (payment_id, sale_id)
);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

comment on table public.payments is
  'Customer money movements. Never hard-delete; cancel/refund via status.';
comment on table public.payment_allocations is
  'Splits a payment across one or more sales for future accounting integration.';
-- Tax configuration and invoices. Tax rates are data, not app constants.

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(8, 4) not null,
  country char(2) not null default 'AE',
  is_active boolean not null default true,
  effective_from date not null default (timezone('utc', now()))::date,
  effective_to date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tax_rates_name_not_blank check (length(trim(name)) > 0),
  constraint tax_rates_rate_non_negative check (rate >= 0),
  constraint tax_rates_effective_window check (
    effective_to is null or effective_to >= effective_from
  )
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  sale_id uuid references public.sales (id) on delete set null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id),
  tax_rate_id uuid references public.tax_rates (id) on delete set null,
  invoice_date date not null default (timezone('utc', now()))::date,
  subtotal numeric(14, 2) not null,
  discount_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  status public.invoice_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoices_number_unique unique (invoice_number),
  constraint invoices_subtotal_non_negative check (subtotal >= 0),
  constraint invoices_discount_non_negative check (discount_amount >= 0),
  constraint invoices_tax_non_negative check (tax_amount >= 0),
  constraint invoices_total_non_negative check (total_amount >= 0),
  constraint invoices_currency_format check (currency ~ '^[A-Z]{3}$')
);

create trigger tax_rates_set_updated_at
before update on public.tax_rates
for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

comment on table public.tax_rates is
  'Configurable VAT/tax. Seed UAE 5% for development; never hardcode rates in the app.';
comment on table public.invoices is
  'Sales invoices. Cancel via status. Never hard-delete issued invoices.';
-- Polymorphic document metadata. Files live in private Storage buckets.

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint document_types_key_unique unique (key),
  constraint document_types_name_not_blank check (length(trim(name)) > 0)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references public.document_types (id),
  entity_type text not null,
  entity_id uuid not null,
  branch_id uuid references public.branches (id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size integer,
  status public.document_status not null default 'active',
  expires_at timestamptz,
  uploaded_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint documents_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint documents_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint documents_file_size_non_negative check (file_size is null or file_size >= 0)
);

-- Optional FK from vehicle_expenses.document_id now that documents exist.
alter table public.vehicle_expenses
  add constraint vehicle_expenses_document_id_fkey
  foreign key (document_id) references public.documents (id) on delete set null;

create trigger document_types_set_updated_at
before update on public.document_types
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

comment on table public.documents is
  'Generic document metadata (entity_type + entity_id). Soft-deleted. Private Storage only.';
-- In-app notification foundation. External delivery comes later.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notifications_type_not_blank check (length(trim(type)) > 0),
  constraint notifications_title_not_blank check (length(trim(title)) > 0),
  constraint notifications_read_consistency check (
    (is_read = false and read_at is null)
    or (is_read = true and read_at is not null)
  )
);

comment on table public.notifications is
  'Per-user notification inbox. Delivery channels (email/WhatsApp) are out of scope for Phase 3.';
-- Append-only audit log. Prefer selective triggers over logging every column twitch.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audit_logs_action_not_blank check (length(trim(action)) > 0),
  constraint audit_logs_entity_type_not_blank check (length(trim(entity_type)) > 0)
);

comment on table public.audit_logs is
  'Security/compliance audit trail. Do not store passwords or secrets in JSON payloads.';
-- Query-oriented indexes. Unique/partial indexes already live on their table migrations.

set search_path = public, extensions;

create index if not exists vehicles_branch_id_idx on public.vehicles (branch_id);
create index if not exists vehicles_status_idx on public.vehicles (status) where deleted_at is null;
create index if not exists vehicles_make_model_idx on public.vehicles (make, model) where deleted_at is null;
create index if not exists vehicles_year_idx on public.vehicles (year) where deleted_at is null;
create index if not exists vehicles_created_at_idx on public.vehicles (created_at desc);
create index if not exists vehicles_make_trgm_idx on public.vehicles using gin (make gin_trgm_ops);
create index if not exists vehicles_model_trgm_idx on public.vehicles using gin (model gin_trgm_ops);
create index if not exists vehicles_stock_trgm_idx on public.vehicles using gin (stock_number gin_trgm_ops);

create index if not exists vehicle_expenses_vehicle_id_idx on public.vehicle_expenses (vehicle_id);
create index if not exists vehicle_expenses_acquisition_id_idx on public.vehicle_expenses (acquisition_id);
create index if not exists vehicle_photos_vehicle_id_idx on public.vehicle_photos (vehicle_id);
create index if not exists vehicle_price_history_vehicle_id_idx on public.vehicle_price_history (vehicle_id);
create index if not exists vehicle_status_history_vehicle_id_idx on public.vehicle_status_history (vehicle_id);

create index if not exists acquisitions_vehicle_id_idx on public.acquisitions (vehicle_id);
create index if not exists acquisitions_branch_id_idx on public.acquisitions (branch_id);
create index if not exists acquisitions_status_idx on public.acquisitions (status);

create index if not exists inspections_vehicle_id_idx on public.inspections (vehicle_id);
create index if not exists inspections_status_idx on public.inspections (status);
create index if not exists inspections_branch_id_idx on public.inspections (branch_id);

create index if not exists workshop_orders_vehicle_id_idx on public.workshop_orders (vehicle_id);
create index if not exists workshop_orders_status_idx on public.workshop_orders (status);
create index if not exists workshop_orders_branch_id_idx on public.workshop_orders (branch_id);

create index if not exists customers_email_idx on public.customers (email) where deleted_at is null and email is not null;
create index if not exists customers_display_name_trgm_idx
  on public.customers using gin (display_name gin_trgm_ops);
create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone gin_trgm_ops);

create index if not exists leads_customer_id_idx on public.leads (customer_id);
create index if not exists leads_vehicle_id_idx on public.leads (vehicle_id);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_status_idx on public.leads (status) where deleted_at is null;
create index if not exists leads_branch_id_idx on public.leads (branch_id);

create index if not exists reservations_vehicle_id_idx on public.reservations (vehicle_id);
create index if not exists reservations_customer_id_idx on public.reservations (customer_id);
create index if not exists reservations_status_idx on public.reservations (status);
create index if not exists reservations_expires_at_idx on public.reservations (expires_at);

create index if not exists sales_vehicle_id_idx on public.sales (vehicle_id);
create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists sales_salesperson_id_idx on public.sales (salesperson_id);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_sale_date_idx on public.sales (sale_date);
create index if not exists sales_branch_id_idx on public.sales (branch_id);

create index if not exists payments_sale_id_idx on public.payments (sale_id);
create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payment_allocations_sale_id_idx on public.payment_allocations (sale_id);

create index if not exists invoices_sale_id_idx on public.invoices (sale_id);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_status_idx on public.invoices (status);

create index if not exists documents_entity_idx on public.documents (entity_type, entity_id)
  where deleted_at is null;
create index if not exists documents_expires_at_idx on public.documents (expires_at)
  where deleted_at is null and expires_at is not null;

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

create index if not exists profiles_branch_id_idx on public.profiles (branch_id) where deleted_at is null;
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);
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
-- Private Storage buckets. Objects are never public; use signed URLs or authenticated access.
-- Path convention examples:
--   vehicle-photos/{vehicle_id}/{uuid}-{filename}
--   vehicle-documents/{vehicle_id}/{uuid}-{filename}
--   inspection-photos/{inspection_id}/{uuid}-{filename}
--   customer-documents/{customer_id}/{uuid}-{filename}
--   sales-documents/{sale_id}/{uuid}-{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'vehicle-photos',
    'vehicle-photos',
    false,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'vehicle-documents',
    'vehicle-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'inspection-photos',
    'inspection-photos',
    false,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'customer-documents',
    'customer-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'sales-documents',
    'sales-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deny-by-default for Storage objects until Phase 4 RBAC policies.
alter table storage.objects enable row level security;

drop policy if exists "Deny anon storage read" on storage.objects;
drop policy if exists "Deny anon storage write" on storage.objects;

-- Authenticated staff may read/write only within the private buckets.
-- Phase 4 will tighten this to branch/permission scoped policies.
create policy "Authenticated read staff buckets"
  on storage.objects
  for select
  to authenticated
  using (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));

create policy "Authenticated insert staff buckets"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));

create policy "Authenticated update staff buckets"
  on storage.objects
  for update
  to authenticated
  using (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ))
  with check (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));

create policy "Authenticated delete staff buckets"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));
-- Enable RLS on every public business table. No permissive public/anon policies.
-- Authenticated access is denied until Phase 4 adds permission-aware policies
-- (except the small bootstrap policies below).
-- The service role bypasses RLS and must never be used in the browser.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches',
    'profiles',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'vehicles',
    'vehicle_expenses',
    'vehicle_price_history',
    'vehicle_status_history',
    'vehicle_photos',
    'suppliers',
    'acquisitions',
    'inspection_templates',
    'inspection_template_items',
    'inspections',
    'inspection_items',
    'inspection_photos',
    'workshop_orders',
    'workshop_items',
    'customers',
    'lead_sources',
    'leads',
    'lead_activities',
    'reservations',
    'sales',
    'sale_price_history',
    'payments',
    'payment_allocations',
    'tax_rates',
    'invoices',
    'document_types',
    'documents',
    'notifications',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Temporary bootstrap: authenticated users can read/update their own profile only.
-- All other tables remain deny-by-default for authenticated/anon until Phase 4.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() and deleted_at is null);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

-- Notifications: users may read/update their own inbox rows.
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on policy "profiles_select_own" on public.profiles is
  'Phase 3 bootstrap. Broader RBAC policies arrive in Phase 4.';
