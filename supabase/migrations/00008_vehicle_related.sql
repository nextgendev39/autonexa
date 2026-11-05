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
