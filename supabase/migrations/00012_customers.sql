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
